import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { user, session, role, userRole } from "../../auth/schema.js";
import { patient, wallet, patientTimeline, patientRegistrationRequest } from "../schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { seedIdentity } from "../../../seed/identity.js";
import { waitFor } from "../../../test/wait-for.js";

vi.mock("../../auth/services/VerificationEmailService.js", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/RegistrationConfirmedEmailService.js", () => ({
  sendRegistrationConfirmedEmail: vi.fn().mockResolvedValue(undefined),
}));

const app = createApp();

let testFacilityId: string;
let otherFacilityId: string;
let regionalAdminCookie: string;
let plainCookie: string;
const createdUserIds: string[] = [];

async function createSessionCookie(): Promise<{ userId: string; cookie: string }> {
  const userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId, email: `auto-reg-${crypto.randomUUID()}@test.com`, passwordHash: "test",
  });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  return { userId, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

// /auth/verify-email is IP-rate-limited (8/15min — deliberately tight now that the token is a
// 6-digit code), and every request in a test run would otherwise share 127.0.0.1 and trip it.
// Each simulated patient gets its own X-Forwarded-For, which is what the limiter keys on
// (lib/rate-limit.ts getDefaultKey) — closer to reality than bypassing the limiter in test env,
// and it keeps the limiter itself exercised rather than switched off.
let fakeIpCounter = 0;
function nextFakeIp(): string {
  fakeIpCounter += 1;
  return `203.0.113.${fakeIpCounter % 254}`;
}

// Registers through the real public endpoint and pulls the OTP straight out of the mocked
// mailer — the same capture pattern email-verification.test.ts uses, since the code is only
// ever stored hashed.
async function registerPatientAndCaptureCode(
  facilityId: string,
  overrides: { fullName?: string; dob?: string } = {},
): Promise<{ userId: string; email: string; code: string }> {
  const { sendVerificationEmail } = await import("../../auth/services/VerificationEmailService.js");
  const email = `autoreg-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  // Unique identity per patient by default — registerPatient enforces FR-01 (same name + DOB +
  // facility is a duplicate), so reusing one fixed name across tests would silently exercise the
  // duplicate path instead of the happy path. The duplicate case gets its own explicit test.
  const uniqueSuffix = crypto.randomUUID().slice(0, 8);

  const res = await request(app).post("/auth/register").send({
    email,
    password: "Password123!",
    fullName: overrides.fullName ?? `Auto Registered-${uniqueSuffix} Patient-${uniqueSuffix}`,
    dob: overrides.dob ?? "1991-07-04",
    gender: "Female",
    phone: "+2348012345678",
    preferredFacilityId: facilityId,
  });
  expect(res.status).toBe(201);
  const userId: string = res.body.user.id;
  createdUserIds.push(userId);

  // Polled rather than slept against a fixed 50ms. The verification email is fire-and-forget
  // (register does not await issueAndSendVerificationEmail), and the suite runs one worker per
  // core, so on a loaded machine the send had simply not landed inside the fixed delay and this
  // failed intermittently with "expected 0 to be greater than 0". Polling waits only as long
  // as it needs to and is not sensitive to machine load.
  const calls = await waitFor(() => {
    const found = vi.mocked(sendVerificationEmail).mock.calls.filter(([to]) => to === email);
    return found.length > 0 ? found : undefined;
  }) ?? [];
  expect(calls.length).toBeGreaterThan(0);
  return { userId, email, code: calls[calls.length - 1]![1] };
}

beforeAll(async () => {
  await seedIdentity();

  const facRows = await db.insert(facility).values([
    { id: crypto.randomUUID(), name: "Auto Reg Facility", region: "Lagos", address: "A St", status: "ACTIVE" },
    { id: crypto.randomUUID(), name: "Auto Reg Alt Facility", region: "Lagos", address: "B St", status: "ACTIVE" },
  ]).returning();
  testFacilityId = facRows[0]!.id;
  otherFacilityId = facRows[1]!.id;

  const admin = await createSessionCookie();
  regionalAdminCookie = admin.cookie;
  const adminRole = await db.select().from(role).where(eq(role.name, "REGIONAL_ADMIN")).limit(1);
  await db.insert(userRole).values({ userId: admin.userId, roleId: adminRole[0]!.id });

  const plain = await createSessionCookie();
  plainCookie = plain.cookie;
});

afterAll(async () => {
  for (const id of createdUserIds) {
    const patientRows = await db.select().from(patient).where(eq(patient.userId, id));
    for (const row of patientRows) {
      await db.delete(patientTimeline).where(eq(patientTimeline.patientId, row.id)).catch(() => {});
      await db.delete(wallet).where(eq(wallet.patientId, row.id)).catch(() => {});
      await db.delete(patient).where(eq(patient.id, row.id)).catch(() => {});
    }
    await db.delete(patientRegistrationRequest).where(eq(patientRegistrationRequest.userId, id)).catch(() => {});
  }
});

describe("auto-registration on email verification", () => {
  it("creates a real patient record, wallet, and timeline entry once the code is verified", async () => {
    const { userId, code } = await registerPatientAndCaptureCode(testFacilityId);

    // Before verifying, the patient record must NOT exist — verification is the trigger.
    const before = await db.select().from(patient).where(eq(patient.userId, userId));
    expect(before).toHaveLength(0);

    const verifyRes = await request(app).post("/auth/verify-email").set("X-Forwarded-For", nextFakeIp()).send({ token: code });
    expect(verifyRes.status).toBe(200);

    const after = await db.select().from(patient).where(eq(patient.userId, userId));
    expect(after).toHaveLength(1);
    const patientRow = after[0]!;
    expect(patientRow.facilityId).toBe(testFacilityId);
    expect(patientRow.gender).toBe("Female");
    expect(patientRow.dob).toBe("1991-07-04");
    // Server-generated, never client-supplied — the whole point of moving issuance here.
    expect(patientRow.uniquePatientId).toMatch(/^OC-\d{6}$/);
    // Not yet confirmed by an admin — that's the remaining onboarding step.
    expect(patientRow.facilityConfirmedAt).toBeNull();

    const walletRows = await db.select().from(wallet).where(eq(wallet.patientId, patientRow.id));
    expect(walletRows).toHaveLength(1);

    const timelineRows = await db.select().from(patientTimeline).where(eq(patientTimeline.patientId, patientRow.id));
    expect(timelineRows.some((t) => t.eventType === "REGISTRATION")).toBe(true);
  });

  it("splits a full name into first/last for the clinical record", async () => {
    const { userId, code } = await registerPatientAndCaptureCode(testFacilityId, {
      fullName: `Ada ${crypto.randomUUID().slice(0, 8)} Okonkwo`,
    });
    await request(app).post("/auth/verify-email").set("X-Forwarded-For", nextFakeIp()).send({ token: code });

    const rows = await db.select().from(patient).where(eq(patient.userId, userId));
    expect(rows[0]!.firstName).toBe("Ada");
    // Everything after the first token is the surname — a middle name stays with it rather
    // than being dropped.
    expect(rows[0]!.lastName).toMatch(/ Okonkwo$/);
  });

  it("still reports the email verified when auto-registration hits FR-01 duplicate detection, leaving the account for Admin to resolve", async () => {
    const sharedName = `Duplicate ${crypto.randomUUID().slice(0, 8)} Identity`;
    const sharedDob = "1975-02-11";

    const first = await registerPatientAndCaptureCode(testFacilityId, { fullName: sharedName, dob: sharedDob });
    const firstVerify = await request(app).post("/auth/verify-email").set("X-Forwarded-For", nextFakeIp()).send({ token: first.code });
    expect(firstVerify.status).toBe(200);
    expect(await db.select().from(patient).where(eq(patient.userId, first.userId))).toHaveLength(1);

    // Same name + DOB + facility as the first — registerPatient rejects it (FR-01).
    const second = await registerPatientAndCaptureCode(testFacilityId, { fullName: sharedName, dob: sharedDob });
    const secondVerify = await request(app).post("/auth/verify-email").set("X-Forwarded-For", nextFakeIp()).send({ token: second.code });

    // Verification itself must still succeed: the email really was verified, and failing here
    // would strand the user (token spent, resend refuses once verified) with no way forward.
    expect(secondVerify.status).toBe(200);
    const userRows = await db.select().from(user).where(eq(user.id, second.userId));
    expect(userRows[0]!.emailVerifiedAt).not.toBeNull();

    // No patient record — the account lands in the `notLinked` state the patient app already
    // handles, and stays in Admin's queue for a human to sort out.
    expect(await db.select().from(patient).where(eq(patient.userId, second.userId))).toHaveLength(0);
    const stillPending = await db.select().from(patientRegistrationRequest).where(eq(patientRegistrationRequest.userId, second.userId));
    expect(stillPending).toHaveLength(1);
  });

  it("does not auto-create a patient for a bare email+password signup (no intake data)", async () => {
    const { sendVerificationEmail } = await import("../../auth/services/VerificationEmailService.js");
    const email = `bare-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const res = await request(app).post("/auth/register").send({ email, password: "Password123!" });
    expect(res.status).toBe(201);
    createdUserIds.push(res.body.user.id);

    const calls = await waitFor(() => {
      const found = vi.mocked(sendVerificationEmail).mock.calls.filter(([to]) => to === email);
      return found.length > 0 ? found : undefined;
    }) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    const code = calls[calls.length - 1]![1];

    const verifyRes = await request(app).post("/auth/verify-email").set("X-Forwarded-For", nextFakeIp()).send({ token: code });
    expect(verifyRes.status).toBe(200);

    const rows = await db.select().from(patient).where(eq(patient.userId, res.body.user.id));
    expect(rows).toHaveLength(0);
  });
});

describe("PATCH /patients/:id/confirm-facility", () => {
  async function verifiedPatient(): Promise<{ userId: string; patientId: string }> {
    const { userId, code } = await registerPatientAndCaptureCode(testFacilityId);
    await request(app).post("/auth/verify-email").set("X-Forwarded-For", nextFakeIp()).send({ token: code });
    const rows = await db.select().from(patient).where(eq(patient.userId, userId));
    return { userId, patientId: rows[0]!.id };
  }

  it("rejects a caller without patient:update", async () => {
    const { patientId } = await verifiedPatient();
    const res = await request(app)
      .patch(`/patients/${patientId}/confirm-facility`)
      .set("Cookie", plainCookie)
      .send({});
    expect(res.status).toBe(403);
  });

  it("sets facilityConfirmedAt, clears the pending queue row, and sends the confirmation email", async () => {
    const { sendRegistrationConfirmedEmail } = await import("../services/RegistrationConfirmedEmailService.js");
    const { userId, patientId } = await verifiedPatient();

    const res = await request(app)
      .patch(`/patients/${patientId}/confirm-facility`)
      .set("Cookie", regionalAdminCookie)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.patient.facilityConfirmedAt).not.toBeNull();

    const rows = await db.select().from(patient).where(eq(patient.id, patientId));
    expect(rows[0]!.facilityConfirmedAt).not.toBeNull();

    // Confirming is what "handled" means now — the row leaves the admin queue.
    const requestRows = await db.select().from(patientRegistrationRequest).where(eq(patientRegistrationRequest.userId, userId));
    expect(requestRows).toHaveLength(0);

    const emailCalls = await waitFor(() => {
      const found = vi.mocked(sendRegistrationConfirmedEmail).mock.calls
        .filter(([, , uniqueId]) => uniqueId === rows[0]!.uniquePatientId);
      return found.length > 0 ? found : undefined;
    }) ?? [];
    expect(emailCalls.length).toBeGreaterThan(0);
  });

  it("reassigns the facility when admin supplies a different one", async () => {
    const { patientId } = await verifiedPatient();

    const res = await request(app)
      .patch(`/patients/${patientId}/confirm-facility`)
      .set("Cookie", regionalAdminCookie)
      .send({ facilityId: otherFacilityId });
    expect(res.status).toBe(200);

    const rows = await db.select().from(patient).where(eq(patient.id, patientId));
    expect(rows[0]!.facilityId).toBe(otherFacilityId);
    expect(rows[0]!.facilityConfirmedAt).not.toBeNull();
  });

  it("404s for a patient that doesn't exist", async () => {
    const res = await request(app)
      .patch(`/patients/${crypto.randomUUID()}/confirm-facility`)
      .set("Cookie", regionalAdminCookie)
      .send({});
    expect(res.status).toBe(404);
  });
});
