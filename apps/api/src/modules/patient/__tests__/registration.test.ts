import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { user, session, role, userRole } from "../../auth/schema.js";
import { patientRegistrationRequest } from "../schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { seedIdentity } from "../../../seed/identity.js";

const app = createApp();

let testFacilityId: string;
let regionalAdminCookie: string;
let plainCookie: string;
let requestUserId: string;

async function createSessionCookie(): Promise<{ userId: string; cookie: string }> {
  const userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId, email: `regadmin-${crypto.randomUUID()}@test.com`, passwordHash: "test",
  });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  return { userId, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

beforeAll(async () => {
  // Real per-role grants, not the TEST_USER_ID/SUPER_ADMIN bypass — this suite is specifically
  // testing that REGIONAL_ADMIN's own grant (identity.ts) works, and that a caller without it
  // is rejected. Idempotent, safe to call alongside the module's own top-level self-invocation.
  await seedIdentity();

  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Registration Test Facility", region: "Lagos", address: "R St", status: "ACTIVE",
  }).returning();
  testFacilityId = facRows[0]!.id;

  const admin = await createSessionCookie();
  regionalAdminCookie = admin.cookie;
  const regionalAdminRoleRow = await db.select().from(role).where(eq(role.name, "REGIONAL_ADMIN")).limit(1);
  await db.insert(userRole).values({ userId: admin.userId, roleId: regionalAdminRoleRow[0]!.id });

  const plain = await createSessionCookie();
  plainCookie = plain.cookie;

  const requestUserRow = await db.insert(user).values({
    id: crypto.randomUUID(), email: `intake-${crypto.randomUUID()}@test.com`, passwordHash: "test",
  }).returning();
  requestUserId = requestUserRow[0]!.id;
  await db.insert(patientRegistrationRequest).values({
    id: crypto.randomUUID(),
    userId: requestUserId,
    email: requestUserRow[0]!.email,
    fullName: "Pending Test Patient",
    dob: "1988-05-20",
    gender: "Female",
    phone: "+2348011112222",
    preferredFacilityId: testFacilityId,
  });
});

describe("GET /patients/pending-registrations — permission", () => {
  it("rejects a caller without patient:create", async () => {
    const res = await request(app).get("/patients/pending-registrations").set("Cookie", plainCookie);
    expect(res.status).toBe(403);
  });

  it("lets a REGIONAL_ADMIN list pending registrations, including the seeded one", async () => {
    const res = await request(app).get("/patients/pending-registrations").set("Cookie", regionalAdminCookie);
    expect(res.status).toBe(200);
    const row = res.body.registrations.find((r: { userId: string }) => r.userId === requestUserId);
    expect(row).toBeDefined();
    expect(row.fullName).toBe("Pending Test Patient");
    expect(row.preferredFacilityId).toBe(testFacilityId);
  });
});

describe("POST /patients — permission (tightened from public)", () => {
  it("rejects a caller without patient:create", async () => {
    const res = await request(app).post("/patients").set("Cookie", plainCookie).send({
      uniquePatientId: "OC-REJECT-1", firstName: "No", lastName: "Perm", dob: "1990-01-01",
      gender: "Male", phone: "+2348000000001", email: `noperm-${crypto.randomUUID()}@test.com`,
      facilityId: testFacilityId,
    });
    expect(res.status).toBe(403);
  });

  it("lets a REGIONAL_ADMIN approve a registration, and removes it from the pending list", async () => {
    const res = await request(app).post("/patients").set("Cookie", regionalAdminCookie).send({
      uniquePatientId: "OC-APPROVE-" + crypto.randomUUID().slice(0, 6).toUpperCase(),
      firstName: "Pending", lastName: "Test", dob: "1988-05-20", gender: "Female",
      phone: "+2348011112222", email: `intake-approved-${crypto.randomUUID()}@test.com`,
      facilityId: testFacilityId, userId: requestUserId,
    });
    expect(res.status).toBe(201);
    expect(res.body.patient.userId).toBe(requestUserId);

    const rows = await db.select().from(patientRegistrationRequest).where(eq(patientRegistrationRequest.userId, requestUserId));
    expect(rows).toHaveLength(0);

    const listRes = await request(app).get("/patients/pending-registrations").set("Cookie", regionalAdminCookie);
    expect(listRes.body.registrations.some((r: { userId: string }) => r.userId === requestUserId)).toBe(false);
  });
});
