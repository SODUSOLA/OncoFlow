import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../app.js";
import { db } from "../../db/index.js";
import { user, session, role, userRole } from "../../modules/auth/schema.js";
import { facility } from "../../modules/facility/schema.js";
import { patient } from "../../modules/patient/schema.js";
import { SESSION_COOKIE_NAME } from "../session-cookie.js";
import { seedIdentity } from "../../seed/identity.js";

// Regression cover for two authorization gaps found during the post-handoff audit, both of
// which were demonstrated exploitable against the running app before the fix:
//
//  1. MFA was enforced only inside requireAuthenticated(), so the 32 routes gated purely by
//     requirePermission/requireRole skipped it entirely — for every role, not just SUPER_ADMIN.
//  2. Controllers filtered on a client-supplied ?facilityId with no check that the caller
//     belonged to it, so one hospital's staff could read another's patients by changing an id,
//     and ?facilityId=all returned every patient on the platform.
//
// These assert behaviour at the HTTP boundary rather than unit-testing the middleware, because
// the bug in (1) was precisely that the middleware was correct but not applied everywhere.

const app = createApp();

let hospitalA: string;
let hospitalAPeer: string;
let hospitalB: string;

const createdUsers: string[] = [];
const createdSessions: string[] = [];
const createdFacilities: string[] = [];
const createdPatients: string[] = [];

type RoleName = (typeof role.name.enumValues)[number];

async function createUser(opts: {
  roleName?: RoleName;
  mfaEnabled: boolean;
  facilityId?: string;
  mfaVerified?: boolean;
}): Promise<{ id: string; cookie: string }> {
  const id = crypto.randomUUID();
  await db.insert(user).values({
    id,
    email: `authz-${id}@test.local`,
    passwordHash: "test",
    mfaEnabled: opts.mfaEnabled,
    // A real base32 secret so the row is shaped like a genuinely enrolled user; these tests
    // never submit a valid TOTP, they only exercise the gate.
    mfaSecret: opts.mfaEnabled ? "JBSWY3DPEHPK3PXP" : null,
    facilityId: opts.facilityId ?? null,
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
    mfaVerified: opts.mfaVerified ?? false,
  });
  createdSessions.push(sessionId);

  return { id, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

async function createFacility(name: string, region: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(facility).values({ id, name, region, address: "test", status: "ACTIVE" });
  createdFacilities.push(id);
  return id;
}

async function createPatient(facilityId: string, firstName: string): Promise<void> {
  const id = crypto.randomUUID();
  await db.insert(patient).values({
    id,
    uniquePatientId: `AZ-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
    firstName, lastName: "Scoped", dob: "1980-01-01", gender: "Female",
    phone: "+2340000000000", email: `${id}@test.local`, facilityId, status: "ACTIVE",
  });
  createdPatients.push(id);
}

beforeAll(async () => {
  await seedIdentity();
  hospitalA = await createFacility("Authz Hospital A", "AuthzRegionA");
  hospitalAPeer = await createFacility("Authz Hospital A Peer", "AuthzRegionA");
  hospitalB = await createFacility("Authz Hospital B", "AuthzRegionB");
  await createPatient(hospitalA, "AuthzAlice");
  await createPatient(hospitalAPeer, "AuthzCara");
  await createPatient(hospitalB, "AuthzBob");
});

afterAll(async () => {
  for (const id of createdPatients) await db.delete(patient).where(eq(patient.id, id)).catch(() => {});
  for (const id of createdSessions) await db.delete(session).where(eq(session.id, id)).catch(() => {});
  for (const id of createdUsers) {
    await db.delete(userRole).where(eq(userRole.userId, id)).catch(() => {});
    await db.delete(user).where(eq(user.id, id)).catch(() => {});
  }
  for (const id of createdFacilities) await db.delete(facility).where(eq(facility.id, id)).catch(() => {});
});

describe("MFA enforcement across every route gate", () => {
  it("blocks a requirePermission-only route when MFA is required but unverified", async () => {
    const caller = await createUser({ roleName: "REGIONAL_ADMIN", mfaEnabled: true, facilityId: hospitalA });
    const res = await request(app).get("/patients?facilityId=all").set("Cookie", caller.cookie);
    expect(res.status).toBe(403);
  });

  it("blocks SUPER_ADMIN too — the permission short-circuit is not an MFA exemption", async () => {
    const caller = await createUser({ roleName: "SUPER_ADMIN", mfaEnabled: true });
    const res = await request(app).get("/patients?facilityId=all").set("Cookie", caller.cookie);
    expect(res.status).toBe(403);
  });

  it("allows the same route once the session is MFA-verified", async () => {
    const caller = await createUser({
      roleName: "REGIONAL_ADMIN", mfaEnabled: true, facilityId: hospitalA, mfaVerified: true,
    });
    const res = await request(app).get("/patients?facilityId=all").set("Cookie", caller.cookie);
    expect(res.status).toBe(200);
  });

  it("does not gate users who have not enabled MFA", async () => {
    const caller = await createUser({ roleName: "REGIONAL_ADMIN", mfaEnabled: false, facilityId: hospitalA });
    const res = await request(app).get("/patients?facilityId=all").set("Cookie", caller.cookie);
    expect(res.status).toBe(200);
  });

  // Deadlock guard: /auth/mfa/verify is the only way to clear the MFA gate, so it must stay
  // reachable while unverified. It must also not require a role grant — it previously demanded
  // auth:update, which no role but SUPER_ADMIN has, meaning enabling MFA on any other account
  // would have locked it out permanently once enforcement was switched on.
  it("keeps POST /auth/mfa/verify reachable while MFA is unverified", async () => {
    const caller = await createUser({ roleName: "REGIONAL_ADMIN", mfaEnabled: true, facilityId: hospitalA });
    const res = await request(app)
      .post("/auth/mfa/verify")
      .set("Cookie", caller.cookie)
      .send({ code: "000000" });
    expect(res.status).not.toBe(403);
  });

  it("keeps POST /auth/logout reachable while MFA is unverified", async () => {
    const caller = await createUser({ roleName: "REGIONAL_ADMIN", mfaEnabled: true, facilityId: hospitalA });
    const res = await request(app).post("/auth/logout").set("Cookie", caller.cookie);
    expect(res.status).toBe(200);
  });
});

describe("facility isolation on ?facilityId", () => {
  it("403s when staff explicitly request a facility outside their region", async () => {
    const caller = await createUser({ roleName: "REGIONAL_ADMIN", mfaEnabled: false, facilityId: hospitalA });
    const res = await request(app).get(`/patients?facilityId=${hospitalB}`).set("Cookie", caller.cookie);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain("AuthzBob");
  });

  it("scopes ?facilityId=all to the caller's own region rather than the whole platform", async () => {
    const caller = await createUser({ roleName: "REGIONAL_ADMIN", mfaEnabled: false, facilityId: hospitalA });
    const res = await request(app).get("/patients?facilityId=all").set("Cookie", caller.cookie);
    expect(res.status).toBe(200);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain("AuthzBob");   // other region — must not leak
    expect(body).toContain("AuthzAlice");     // own facility
    expect(body).toContain("AuthzCara");      // peer facility in the same region
  });

  it("leaves facility-less privileged accounts unrestricted", async () => {
    const caller = await createUser({ roleName: "SUPER_ADMIN", mfaEnabled: false });
    const res = await request(app).get("/patients?facilityId=all").set("Cookie", caller.cookie);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain("AuthzBob");
  });

  // Authorization and filtering are separate concerns: an unrestricted caller is *allowed* to
  // see every facility, but asking for one specific facility must still narrow the results.
  // A first cut of the scope logic dropped the requested id for unrestricted callers, silently
  // returning every patient on the platform to a filtered request.
  it("still honours an explicit ?facilityId as a filter for unrestricted callers", async () => {
    const caller = await createUser({ roleName: "SUPER_ADMIN", mfaEnabled: false });
    const res = await request(app).get(`/patients?facilityId=${hospitalB}`).set("Cookie", caller.cookie);
    expect(res.status).toBe(200);

    const body = JSON.stringify(res.body);
    expect(body).toContain("AuthzBob");        // the requested facility
    expect(body).not.toContain("AuthzAlice");  // must not bleed in other facilities
    expect(body).not.toContain("AuthzCara");
  });
});
