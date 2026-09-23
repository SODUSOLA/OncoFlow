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

// Regression tests for two audit findings: MFA skipped on permission-only routes, and client-supplied ?facilityId not being checked against the caller's facility.

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

// Inserts a throwaway staff user (optionally MFA-enabled) with the given role for a test.
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
    // A real base32 secret so the row looks enrolled; tests only exercise the MFA gate and never submit a TOTP.
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

// Inserts a test facility in the given region and returns its id.
async function createFacility(name: string, region: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(facility).values({ id, name, region, address: "test", status: "ACTIVE" });
  createdFacilities.push(id);
  return id;
}

// Inserts a test patient in the given facility and returns its id.
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

// Inserts a test invoice for the patient and returns its id.
async function createInvoice(facilityId: string, patientId: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(invoice).values({
    id, patientId, facilityId, classificationId,
    totalKobo: 100000n, status: "DRAFT",
  });
  createdInvoices.push(id);
  return id;
}

// Inserts a test appointment for the patient at the facility.
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

  // Reuses the seeded serviceClassification row, creating (and later cleaning up) one only if the table is empty.
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
  // Deletes audit rows first because denials reference the user by FK; errors are left unswallowed so a leak fails loudly.
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

  // Guards a deadlock: /auth/mfa/verify must stay reachable while MFA is unverified and must not require a role grant.
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

  // Narrowing by an explicit ?facilityId must still work for unrestricted callers, who are only allowed (not forced) to see everything.
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

// The same untrusted-?facilityId hole existed on every list endpoint, so these cover the rest via resolveScopeOrDeny.
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

  // An appointments query with no facilityId must be limited to the caller's own region.
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
