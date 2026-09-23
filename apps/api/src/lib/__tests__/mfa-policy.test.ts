import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../app.js";
import { db } from "../../db/index.js";
import { user, session, role, userRole } from "../../modules/auth/schema.js";
import { auditLog } from "../../modules/audit/schema.js";
import { SESSION_COOKIE_NAME } from "../session-cookie.js";
import { seedIdentity } from "../../seed/identity.js";
import { config } from "../../config.js";

// Covers the MFA policy layer and enrolment flow, pinning three defects: no enrol route, non-RFC-4648 base32, and login pre-verifying unenrolled staff.

const app = createApp();

const createdUsers: string[] = [];
const createdSessions: string[] = [];

type RoleName = (typeof role.name.enumValues)[number];

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// Independent RFC 4648 decoder and RFC 6238 TOTP, to prove the server interoperates with what an authenticator app does.
function base32DecodeStandard(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of input.replace(/=+$/, "")) {
    const idx = BASE32_ALPHABET.indexOf(ch.toUpperCase());
    if (idx < 0) throw new Error(`Invalid base32 character: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

// Generates the current 6-digit TOTP code for a base32 secret.
function totp(secretBase32: string): string {
  const key = base32DecodeStandard(secretBase32);
  const counter = Buffer.alloc(8);
  counter.writeBigInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)), 0);
  const hmac = crypto.createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(bin % 1000000).padStart(6, "0");
}

const PASSWORD = "correct-horse-battery";

// `loginable` opts into a real bcrypt hash, since hashing for every user slowed the parallel suite.
async function createUser(opts: {
  roleName?: RoleName; mfaEnabled?: boolean; loginable?: boolean;
}): Promise<{ id: string; email: string; cookie: string }> {
  const id = crypto.randomUUID();
  const email = `mfapolicy-${id}@test.local`;
  const passwordHash = opts.loginable
    ? await (await import("bcryptjs")).default.hash(PASSWORD, 10)
    : "not-a-real-hash";
  await db.insert(user).values({
    id,
    email,
    passwordHash,
    status: "ACTIVE",
    mfaEnabled: opts.mfaEnabled ?? false,
    emailVerifiedAt: new Date(),
  });
  createdUsers.push(id);

  if (opts.roleName) {
    const roleRow = await db.select().from(role).where(eq(role.name, opts.roleName)).limit(1);
    await db.insert(userRole).values({ userId: id, roleId: roleRow[0]!.id });
  }

  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId: id, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000),
    mfaVerified: false,
  });
  createdSessions.push(sessionId);

  return { id, email, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

beforeAll(async () => {
  await seedIdentity();
});

// The policy flag is read at call time, so toggling the config object suffices, but each test must restore it.
afterEach(() => {
  config.mfaEnforceStaff = false;
});

afterAll(async () => {
  // Deletes audit rows first because ACCESS_DENIED rows reference the actor by FK; otherwise cleanup silently failed and leaked users.
  if (createdUsers.length > 0) {
    await db.delete(auditLog).where(inArray(auditLog.actorId, createdUsers));
    await db.delete(session).where(inArray(session.userId, createdUsers));
    await db.delete(userRole).where(inArray(userRole.userId, createdUsers));
    await db.delete(user).where(inArray(user.id, createdUsers));
  }
});

describe("base32 / TOTP interoperability", () => {
  it("issues a secret an independent RFC 4648 implementation can verify against", async () => {
    const staff = await createUser({ roleName: "REGIONAL_ADMIN" });

    const enroll = await request(app).post("/auth/mfa/enroll").set("Cookie", staff.cookie);
    expect(enroll.status).toBe(200);
    const secret: string = enroll.body.secret;
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);

    // 10 random bytes -> 16 significant base32 chars. The old encoder emitted 20.
    expect(secret.replace(/=/g, "")).toHaveLength(16);
    expect(base32DecodeStandard(secret)).toHaveLength(10);

    // The decisive check: a code generated entirely outside the server is accepted by it.
    const res = await request(app)
      .post("/auth/mfa/verify").set("Cookie", staff.cookie).send({ code: totp(secret) });
    expect(res.status).toBe(200);
    expect(res.body.mfaVerified).toBe(true);
  });
});

describe("two-phase MFA enrolment", () => {
  it("stores the secret but leaves MFA disabled until a code confirms it", async () => {
    const staff = await createUser({ roleName: "REGIONAL_ADMIN" });

    const enroll = await request(app).post("/auth/mfa/enroll").set("Cookie", staff.cookie);
    expect(enroll.status).toBe(200);

    // Pending, not enabled — so an abandoned enrolment cannot lock the account out.
    const [pending] = await db.select().from(user).where(eq(user.id, staff.id));
    expect(pending!.mfaSecret).toBeTruthy();
    expect(pending!.mfaEnabled).toBe(false);

    await request(app).post("/auth/mfa/verify")
      .set("Cookie", staff.cookie).send({ code: totp(enroll.body.secret) }).expect(200);

    const [confirmed] = await db.select().from(user).where(eq(user.id, staff.id));
    expect(confirmed!.mfaEnabled).toBe(true);
  });

  it("re-issues a fresh secret while enrolment is still unconfirmed", async () => {
    const staff = await createUser({ roleName: "REGIONAL_ADMIN" });
    const first = await request(app).post("/auth/mfa/enroll").set("Cookie", staff.cookie);
    const second = await request(app).post("/auth/mfa/enroll").set("Cookie", staff.cookie);

    expect(second.status).toBe(200);
    expect(second.body.secret).not.toBe(first.body.secret);
    // The superseded secret must stop working, or enrolment would leave two live factors.
    await request(app).post("/auth/mfa/verify")
      .set("Cookie", staff.cookie).send({ code: totp(first.body.secret) }).expect(400);
  });

  it("refuses to replace an already-confirmed factor", async () => {
    const staff = await createUser({ roleName: "REGIONAL_ADMIN" });
    const enroll = await request(app).post("/auth/mfa/enroll").set("Cookie", staff.cookie);
    await request(app).post("/auth/mfa/verify")
      .set("Cookie", staff.cookie).send({ code: totp(enroll.body.secret) }).expect(200);

    // Otherwise a stolen session cookie could swap the second factor for the attacker's own.
    const again = await request(app).post("/auth/mfa/enroll").set("Cookie", staff.cookie);
    expect(again.status).toBe(400);
  });

  it("rejects an incorrect code without enabling MFA", async () => {
    const staff = await createUser({ roleName: "REGIONAL_ADMIN" });
    await request(app).post("/auth/mfa/enroll").set("Cookie", staff.cookie).expect(200);

    await request(app).post("/auth/mfa/verify")
      .set("Cookie", staff.cookie).send({ code: "000000" }).expect(400);

    const [row] = await db.select().from(user).where(eq(user.id, staff.id));
    expect(row!.mfaEnabled).toBe(false);
  });
});

describe("staff MFA policy", () => {
  it("gates an un-enrolled staff account once enforcement is on", async () => {
    const staff = await createUser({ roleName: "REGIONAL_ADMIN" });
    await request(app).get("/patients?facilityId=all").set("Cookie", staff.cookie).expect(200);

    config.mfaEnforceStaff = true;

    const res = await request(app).get("/patients?facilityId=all").set("Cookie", staff.cookie);
    expect(res.status).toBe(403);
  });

  it("leaves PATIENT accounts opt-in under the same policy", async () => {
    const patient = await createUser({ roleName: "PATIENT" });
    config.mfaEnforceStaff = true;

    // A patient reaches only their own record, so policy does not force a second factor.
    const res = await request(app).get("/auth/profile").set("Cookie", patient.cookie);
    expect(res.status).toBe(200);
  });

  it("still gates a PATIENT who opted in voluntarily", async () => {
    const patient = await createUser({ roleName: "PATIENT", mfaEnabled: true });
    const res = await request(app).get("/auth/profile").set("Cookie", patient.cookie);
    expect(res.status).toBe(403);
  });

  it("does not gate a role-less account it could never let enrol out of", async () => {
    const orphan = await createUser({});
    config.mfaEnforceStaff = true;
    const res = await request(app).get("/auth/profile").set("Cookie", orphan.cookie);
    expect(res.status).toBe(200);
  });

  it("keeps enrolment reachable for a policy-gated, un-enrolled account", async () => {
    const staff = await createUser({ roleName: "REGIONAL_ADMIN" });
    config.mfaEnforceStaff = true;

    // The policy-created deadlock case: required to use MFA but holds no secret, so the enrol route must not be gated.
    const enroll = await request(app).post("/auth/mfa/enroll").set("Cookie", staff.cookie);
    expect(enroll.status).toBe(200);

    await request(app).post("/auth/mfa/verify")
      .set("Cookie", staff.cookie).send({ code: totp(enroll.body.secret) }).expect(200);

    await request(app).get("/patients?facilityId=all").set("Cookie", staff.cookie).expect(200);
  });
});

describe("login under the staff policy", () => {
  it("issues an unverified session and flags enrolment for un-enrolled staff", async () => {
    const staff = await createUser({ roleName: "REGIONAL_ADMIN", loginable: true });
    config.mfaEnforceStaff = true;

    const res = await request(app)
      .post("/auth/login").send({ email: staff.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.mfaRequired).toBe(true);
    expect(res.body.mfaEnrollmentPending).toBe(true);
    // The regression: this was derived from mfaEnabled, so it came back true here.
    expect(res.body.mfaVerified).toBe(false);
  });

  it("issues a verified session when MFA does not apply", async () => {
    const patient = await createUser({ roleName: "PATIENT", loginable: true });
    const res = await request(app)
      .post("/auth/login").send({ email: patient.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.mfaRequired).toBe(false);
    expect(res.body.mfaEnrollmentPending).toBe(false);
    expect(res.body.mfaVerified).toBe(true);
  });
});
