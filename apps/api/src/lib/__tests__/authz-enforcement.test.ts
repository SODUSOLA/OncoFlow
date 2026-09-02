import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../app.js";
import { db } from "../../db/index.js";
import { user, session, role, userRole } from "../../modules/auth/schema.js";
import { facility } from "../../modules/facility/schema.js";
import { patient } from "../../modules/patient/schema.js";
import { invoice, serviceClassification } from "../../modules/billing/schema.js";
import { appointment } from "../../modules/appointment/schema.js";
import { auditLog } from "../../modules/audit/schema.js";
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

let classificationId: string;
let createdClassification = false;
let invoiceAlice: string;
let invoiceCara: string;
let invoiceBob: string;
let hospitalA: string;
let hospitalAPeer: string;
let hospitalB: string;

const createdUsers: string[] = [];
const createdSessions: string[] = [];
const createdFacilities: string[] = [];
const createdPatients: string[] = [];
const createdInvoices: string[] = [];
const createdAppointments: string[] = [];

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

async function createPatient(facilityId: string, firstName: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(patient).values({
    id,
    uniquePatientId: `AZ-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
    firstName, lastName: "Scoped", dob: "1980-01-01", gender: "Female",
    phone: "+2340000000000", email: `${id}@test.local`, facilityId, status: "ACTIVE",
  });
  createdPatients.push(id);
  return id;
}

async function createInvoice(facilityId: string, patientId: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(invoice).values({
    id, patientId, facilityId, classificationId,
    totalKobo: 100000n, status: "DRAFT",
  });
  createdInvoices.push(id);
  return id;
}

async function createAppointment(facilityId: string, patientId: string): Promise<void> {
  const id = crypto.randomUUID();
  await db.insert(appointment).values({
    id, patientId, facilityId, appointmentType: "VIRTUAL",
    scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000), status: "PENDING",
  });
  createdAppointments.push(id);
}

beforeAll(async () => {
  await seedIdentity();
  hospitalA = await createFacility("Authz Hospital A", "AuthzRegionA");
  hospitalAPeer = await createFacility("Authz Hospital A Peer", "AuthzRegionA");
  hospitalB = await createFacility("Authz Hospital B", "AuthzRegionB");
  const alice = await createPatient(hospitalA, "AuthzAlice");
  const cara = await createPatient(hospitalAPeer, "AuthzCara");
  const bob = await createPatient(hospitalB, "AuthzBob");

  // serviceClassification.name is an enum with a fixed, seeded set — reuse whatever is there
  // rather than inventing one, and only create (and later clean up) if the table is empty.
  const existingClassification = await db.select().from(serviceClassification).limit(1);
  if (existingClassification[0]) {
    classificationId = existingClassification[0].id;
  } else {
    classificationId = crypto.randomUUID();
    await db.insert(serviceClassification).values({
      id: classificationId, name: "CONSULTATION", cappedNetworkFeeKobo: 0n,
    });
    createdClassification = true;
  }

  invoiceAlice = await createInvoice(hospitalA, alice);
  invoiceCara = await createInvoice(hospitalAPeer, cara);
  invoiceBob = await createInvoice(hospitalB, bob);

  await createAppointment(hospitalA, alice);
  await createAppointment(hospitalB, bob);
});

afterAll(async () => {
  for (const id of createdAppointments) await db.delete(appointment).where(eq(appointment.id, id));
  for (const id of createdInvoices) await db.delete(invoice).where(eq(invoice.id, id));
  if (createdClassification) {
    await db.delete(serviceClassification).where(eq(serviceClassification.id, classificationId));
  }
  for (const id of createdPatients) await db.delete(patient).where(eq(patient.id, id));
  for (const id of createdSessions) await db.delete(session).where(eq(session.id, id));
  // Audit rows must go first: these tests deliberately trigger denials, and rbac.ts records
  // each one with actor_id referencing the user, so deleting the user violates that FK. The
  // deletes below used to swallow every error with .catch(() => {}), which turned that failure
  // into a silent leak — one run per suite, accumulating MFA-enabled accounts in the dev
  // database. Left unswallowed now so a future leak fails loudly instead of quietly growing.
  if (createdUsers.length > 0) {
    await db.delete(auditLog).where(inArray(auditLog.actorId, createdUsers));
  }
  for (const id of createdUsers) {
    await db.delete(userRole).where(eq(userRole.userId, id));
    await db.delete(user).where(eq(user.id, id));
  }
  for (const id of createdFacilities) await db.delete(facility).where(eq(facility.id, id));
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

// The same untrusted-?facilityId hole existed on every other list endpoint that accepts one.
// Patient search was fixed first; these cover the rest (billing, appointments, tariffs,
// staffing), which all now route through the shared resolveScopeOrDeny helper.
describe("facility isolation on the remaining ?facilityId endpoints", () => {
  it("403s on invoices for a facility outside the caller's region", async () => {
    const caller = await createUser({ roleName: "REGIONAL_ADMIN", mfaEnabled: false, facilityId: hospitalA });
    const res = await request(app).get(`/invoices?facilityId=${hospitalB}`).set("Cookie", caller.cookie);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain(invoiceBob);
  });

  it("scopes ?facilityId=all on invoices to the caller's own region", async () => {
    const caller = await createUser({ roleName: "REGIONAL_ADMIN", mfaEnabled: false, facilityId: hospitalA });
    const res = await request(app).get("/invoices?facilityId=all").set("Cookie", caller.cookie);
    expect(res.status).toBe(200);

    const body = JSON.stringify(res.body);
    expect(body).toContain(invoiceAlice);   // own facility
    expect(body).toContain(invoiceCara);    // peer facility, same region
    expect(body).not.toContain(invoiceBob); // other region — must not leak
  });

  it("403s on appointments for a facility outside the caller's region", async () => {
    const caller = await createUser({ roleName: "REGIONAL_ADMIN", mfaEnabled: false, facilityId: hospitalA });
    const res = await request(app).get(`/appointments?facilityId=${hospitalB}`).set("Cookie", caller.cookie);
    expect(res.status).toBe(403);
  });

  // /appointments takes no "all" sentinel (its query schema only accepts a uuid), so the
  // list-everything request is simply omitting facilityId — which is precisely the case that
  // used to return every appointment on the platform to any caller with appointment:read.
  it("scopes a facility-less appointment query to the caller's own region", async () => {
    const caller = await createUser({ roleName: "REGIONAL_ADMIN", mfaEnabled: false, facilityId: hospitalA });
    const res = await request(app).get("/appointments?status=PENDING").set("Cookie", caller.cookie);
    expect(res.status).toBe(200);

    const facilityIds = (res.body.appointments as { facilityId: string }[]).map((a) => a.facilityId);
    expect(facilityIds.length).toBeGreaterThan(0);
    expect(facilityIds).not.toContain(hospitalB);
  });

  it("403s on tariffs for a facility outside the caller's region", async () => {
    const caller = await createUser({ roleName: "REGIONAL_ADMIN", mfaEnabled: false, facilityId: hospitalA });
    const res = await request(app).get(`/tariffs?facilityId=${hospitalB}`).set("Cookie", caller.cookie);
    expect(res.status).toBe(403);
  });

  it("403s on the eligible-nurse roster for a facility outside the caller's region", async () => {
    const caller = await createUser({ roleName: "REGIONAL_ADMIN", mfaEnabled: false, facilityId: hospitalA });
    const res = await request(app)
      .get(`/staffing/eligible-nurses?facilityId=${hospitalB}`).set("Cookie", caller.cookie);
    expect(res.status).toBe(403);
  });
});
