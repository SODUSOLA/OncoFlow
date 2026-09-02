import { describe, it, expect, vi, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { user, passwordResetToken, session } from "../schema.js";
import { waitFor } from "../../../test/wait-for.js";

vi.mock("../services/PasswordResetEmailService.js", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

const app = createApp();
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(passwordResetToken).where(eq(passwordResetToken.userId, id)).catch(() => {});
    await db.delete(session).where(eq(session.userId, id)).catch(() => {});
    await db.delete(user).where(eq(user.id, id)).catch(() => {});
  }
});

async function registerUser(): Promise<{ userId: string; email: string; password: string }> {
  const email = `reset-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = "OriginalPass123!";
  const res = await request(app).post("/auth/register").send({ email, password });
  expect(res.status).toBe(201);
  const userId: string = res.body.user.id;
  createdUserIds.push(userId);
  return { userId, email, password };
}

async function requestResetAndCaptureToken(email: string): Promise<string> {
  const { sendPasswordResetEmail } = await import("../services/PasswordResetEmailService.js");

  const res = await request(app).post("/auth/forgot-password").send({ email });
  expect(res.status).toBe(200);
  expect(res.body.sent).toBe(true);

  // Fire-and-forget path (requestPasswordReset awaits the send internally, but the caller
  // pattern elsewhere in this module is still tolerant of a tick of delay) — same reasoning
  // as email-verification.test.ts's registerAndCaptureToken, and same reason this isn't
  // asserting a call *count*: the mock is shared module-wide across every test in this file.
  await waitFor(() =>
    vi.mocked(sendPasswordResetEmail).mock.calls.some(([to]) => to === email));
  // Last matching call, not first: a test that calls this twice for the same email (to
  // exercise invalidateAllForUser) would otherwise always get the FIRST matching call back,
  // i.e. the stale token, since the mock's call list only ever grows across every request in
  // this file. (Not using Array.findLast — this repo's configured TS lib predates ES2023.)
  const matches = vi.mocked(sendPasswordResetEmail).mock.calls.filter(([to]) => to === email);
  const call = matches[matches.length - 1];
  expect(call).toBeDefined();
  return call![1];
}

describe("forgot-password — request", () => {
  it("sends a reset email and creates a pending token row for an existing account", async () => {
    const { userId, email } = await registerUser();
    await requestResetAndCaptureToken(email);

    const rows = await db.select().from(passwordResetToken).where(eq(passwordResetToken.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.consumedAt).toBeNull();
    expect(rows[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns the same 200/{sent:true} shape for an email with no account, and creates nothing", async () => {
    const { sendPasswordResetEmail } = await import("../services/PasswordResetEmailService.js");
    const callsBefore = vi.mocked(sendPasswordResetEmail).mock.calls.length;

    const res = await request(app)
      .post("/auth/forgot-password")
      .send({ email: `no-such-account-${Date.now()}@example.com` });

    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
    // No enumeration signal: nothing was sent or written for a nonexistent account.
    expect(vi.mocked(sendPasswordResetEmail).mock.calls.length).toBe(callsBefore);
  });

  it("a second request invalidates the first token — only the newest link works", async () => {
    const { userId, email } = await registerUser();
    const firstToken = await requestResetAndCaptureToken(email);
    const secondToken = await requestResetAndCaptureToken(email);

    const rows = await db.select().from(passwordResetToken).where(eq(passwordResetToken.userId, userId));
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.consumedAt !== null)).toHaveLength(1);

    const staleAttempt = await request(app)
      .post("/auth/reset-password")
      .send({ token: firstToken, password: "WontWork123!" });
    expect(staleAttempt.status).toBe(400);

    const freshAttempt = await request(app)
      .post("/auth/reset-password")
      .send({ token: secondToken, password: "WillWork123!" });
    expect(freshAttempt.status).toBe(200);
  });
});

describe("reset-password", () => {
  it("resets the password, and the account can log in with the new one but not the old one", async () => {
    const { email, password } = await registerUser();
    const rawToken = await requestResetAndCaptureToken(email);

    const resetRes = await request(app)
      .post("/auth/reset-password")
      .send({ token: rawToken, password: "BrandNewPass123!" });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.ok).toBe(true);

    const oldLogin = await request(app).post("/auth/login").send({ email, password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post("/auth/login").send({ email, password: "BrandNewPass123!" });
    expect(newLogin.status).toBe(200);
  });

  it("marks the token consumed so it can't be reused", async () => {
    const { email } = await registerUser();
    const rawToken = await requestResetAndCaptureToken(email);

    const first = await request(app).post("/auth/reset-password").send({ token: rawToken, password: "FirstUse123!" });
    expect(first.status).toBe(200);

    const second = await request(app).post("/auth/reset-password").send({ token: rawToken, password: "SecondUse123!" });
    expect(second.status).toBe(400);
  });

  it("rejects a garbage token", async () => {
    const res = await request(app).post("/auth/reset-password").send({ token: "not-a-real-token", password: "Whatever123!" });
    expect(res.status).toBe(400);
  });

  it("revokes every existing session for the account — a reset shouldn't leave old sessions live", async () => {
    const { userId, email, password } = await registerUser();

    const loginA = await request(app).post("/auth/login").send({ email, password });
    expect(loginA.status).toBe(200);
    const loginB = await request(app).post("/auth/login").send({ email, password });
    expect(loginB.status).toBe(200);

    const activeBefore = await db.select().from(session).where(eq(session.userId, userId));
    expect(activeBefore.filter((s) => s.revokedAt === null)).toHaveLength(2);

    const rawToken = await requestResetAndCaptureToken(email);
    const resetRes = await request(app).post("/auth/reset-password").send({ token: rawToken, password: "AfterReset123!" });
    expect(resetRes.status).toBe(200);

    const activeAfter = await db.select().from(session).where(eq(session.userId, userId));
    expect(activeAfter.filter((s) => s.revokedAt === null)).toHaveLength(0);
  });

  it("rejects a password shorter than 8 characters (route-level validation)", async () => {
    const { email } = await registerUser();
    const rawToken = await requestResetAndCaptureToken(email);

    const res = await request(app).post("/auth/reset-password").send({ token: rawToken, password: "short" });
    expect(res.status).toBe(400);
  });
});
