import { describe, it, expect, vi, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { user, emailVerificationToken } from "../schema.js";

vi.mock("../services/VerificationEmailService.js", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

const app = createApp();
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(emailVerificationToken).where(eq(emailVerificationToken.userId, id)).catch(() => {});
    await db.delete(user).where(eq(user.id, id)).catch(() => {});
  }
});

// /auth/verify-email is IP-rate-limited (8/15min — tight on purpose now that the token is a
// 6-digit code, see auth/routes.ts). Every request here would otherwise share 127.0.0.1 and
// trip it partway through the file, so each call gets its own X-Forwarded-For — the header the
// limiter actually keys on (lib/rate-limit.ts getDefaultKey). Keeps the limiter exercised
// rather than disabled in test env.
let fakeIpCounter = 0;
function nextFakeIp(): string {
  fakeIpCounter += 1;
  return `198.51.100.${fakeIpCounter % 254}`;
}

function sessionCookieFrom(res: { headers: { "set-cookie"?: string[] } }): string {
  const cookies = res.headers["set-cookie"] ?? [];
  const cookieStr = cookies.find((c) => c.startsWith("oncoflow_session="));
  return cookieStr!.split(";")[0]!;
}

async function registerAndCaptureToken(): Promise<{ userId: string; email: string; rawToken: string; sessionCookie: string }> {
  const { sendVerificationEmail } = await import("../services/VerificationEmailService.js");

  const email = `verify-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = "Password123!";
  const registerRes = await request(app).post("/auth/register").send({ email, password });
  expect(registerRes.status).toBe(201);
  const userId: string = registerRes.body.user.id;
  createdUserIds.push(userId);

  // The verification email is fire-and-forget (issueAndSendVerificationEmail isn't awaited by
  // register) — give its microtask a tick to run before asserting on its side effects, same
  // pattern as PaymentService's notification test. Deliberately not asserting a call *count*
  // here (e.g. toHaveBeenCalledTimes) — this mock is shared module-wide across every test in
  // this file, and another test's own fire-and-forget send can still be settling when this one
  // starts, since nothing awaits it. Finding the call for *this* email is what's actually being
  // asserted, and is robust to that overlap.
  await new Promise((r) => setTimeout(r, 50));

  const call = vi.mocked(sendVerificationEmail).mock.calls.find(([to]) => to === email);
  expect(call).toBeDefined();
  const rawToken = call![1];

  const loginRes = await request(app).post("/auth/login").send({ email, password });
  expect(loginRes.status).toBe(200);

  return { userId, email, rawToken, sessionCookie: sessionCookieFrom(loginRes) };
}

describe("email verification — code format", () => {
  it("mails a 6-digit numeric code, not a link token", async () => {
    const { rawToken } = await registerAndCaptureToken();
    expect(rawToken).toMatch(/^\d{6}$/);
  });

  it("expires the code in ~10 minutes, not 24 hours", async () => {
    const { userId } = await registerAndCaptureToken();
    const rows = await db.select().from(emailVerificationToken).where(eq(emailVerificationToken.userId, userId));
    const ttlMs = rows[0]!.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(8 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(10 * 60 * 1000);
  });
});

describe("email verification — registration", () => {
  it("sends a verification email and creates a pending token row on register", async () => {
    const { userId } = await registerAndCaptureToken();

    const rows = await db.select().from(emailVerificationToken).where(eq(emailVerificationToken.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.consumedAt).toBeNull();

    const userRows = await db.select().from(user).where(eq(user.id, userId));
    expect(userRows[0]!.emailVerifiedAt).toBeNull();
  });

  it("register still returns 201 even though the mocked email send is stubbed out", async () => {
    // Real-world equivalent: RESEND_API_KEY unset — sendVerificationEmail throws internally,
    // but registration itself must be unaffected (see PaymentService's identical tolerance).
    const email = `verify-fail-${Date.now()}@example.com`;
    const { sendVerificationEmail } = await import("../services/VerificationEmailService.js");
    vi.mocked(sendVerificationEmail).mockRejectedValueOnce(new Error("Resend not configured"));

    const res = await request(app).post("/auth/register").send({ email, password: "Password123!" });
    expect(res.status).toBe(201);
    createdUserIds.push(res.body.user.id);
  });
});

describe("email verification — verify-email", () => {
  it("verifies with a valid token and marks the user's email verified", async () => {
    const { userId, rawToken } = await registerAndCaptureToken();

    const res = await request(app).post("/auth/verify-email").set("X-Forwarded-For", nextFakeIp()).send({ token: rawToken });
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);

    const userRows = await db.select().from(user).where(eq(user.id, userId));
    expect(userRows[0]!.emailVerifiedAt).not.toBeNull();

    const tokenRows = await db.select().from(emailVerificationToken).where(eq(emailVerificationToken.userId, userId));
    expect(tokenRows[0]!.consumedAt).not.toBeNull();
  });

  it("rejects a garbage token", async () => {
    const res = await request(app).post("/auth/verify-email").set("X-Forwarded-For", nextFakeIp()).send({ token: "not-a-real-token" });
    expect(res.status).toBe(400);
  });

  it("rejects reusing an already-consumed token", async () => {
    const { rawToken } = await registerAndCaptureToken();

    const first = await request(app).post("/auth/verify-email").set("X-Forwarded-For", nextFakeIp()).send({ token: rawToken });
    expect(first.status).toBe(200);

    const second = await request(app).post("/auth/verify-email").set("X-Forwarded-For", nextFakeIp()).send({ token: rawToken });
    expect(second.status).toBe(400);
  });
});

describe("email verification — resend", () => {
  // A bare request with no session cookie authenticates in this test environment as the
  // suite-wide TEST_USER_ID fallback (src/test/setup.ts, request-context.ts) — genuinely
  // testing the unauthenticated-401 path needs the isolated test-app setup request-context.
  // test.ts uses, not this shared createApp(). requireAuthenticated() itself is already
  // covered there; not re-tested here.

  it("issues a new token that invalidates the previous one", async () => {
    const { userId, email, sessionCookie } = await registerAndCaptureToken();
    const { sendVerificationEmail } = await import("../services/VerificationEmailService.js");
    const callsBefore = vi.mocked(sendVerificationEmail).mock.calls.length;

    const resendRes = await request(app)
      .post("/auth/resend-verification")
      .set("Cookie", sessionCookie)
      .send();
    expect(resendRes.status).toBe(200);
    expect(resendRes.body.sent).toBe(true);

    await new Promise((r) => setTimeout(r, 50));
    const callsForEmail = vi.mocked(sendVerificationEmail).mock.calls.filter(([to]) => to === email);
    expect(callsForEmail.length).toBeGreaterThan(0);
    expect(vi.mocked(sendVerificationEmail).mock.calls.length).toBeGreaterThan(callsBefore);
    const [, newRawToken] = callsForEmail[callsForEmail.length - 1]!;

    const rows = await db.select().from(emailVerificationToken).where(eq(emailVerificationToken.userId, userId));
    expect(rows).toHaveLength(2);
    const consumedCount = rows.filter((r) => r.consumedAt !== null).length;
    expect(consumedCount).toBe(1); // the original, invalidated by the resend

    const verifyWithNew = await request(app).post("/auth/verify-email").set("X-Forwarded-For", nextFakeIp()).send({ token: newRawToken });
    expect(verifyWithNew.status).toBe(200);
  });

  it("rejects resend once the email is already verified", async () => {
    const { rawToken, sessionCookie } = await registerAndCaptureToken();

    const verifyRes = await request(app).post("/auth/verify-email").set("X-Forwarded-For", nextFakeIp()).send({ token: rawToken });
    expect(verifyRes.status).toBe(200);

    const resendRes = await request(app)
      .post("/auth/resend-verification")
      .set("Cookie", sessionCookie)
      .send();
    expect(resendRes.status).toBe(409);
  });
});
