import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { patient } from "../../patient/schema.js";
import { user, session, role, userRole } from "../../auth/schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { seedIdentity } from "../../../seed/identity.js";

const app = createApp();

let facilityAId: string;
let facilityBId: string;
let outOfRegionFacilityId: string;
let testPatientId: string;
let regionalAdminCookie: string;
let plainCookie: string;

async function createSessionCookie(): Promise<{ userId: string; cookie: string }> {
  const userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId, email: `transfer-${crypto.randomUUID()}@test.com`, passwordHash: "test",
  });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  return { userId, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

beforeAll(async () => {
  await seedIdentity();

  const facRows = await db.insert(facility).values([
    { id: crypto.randomUUID(), name: "Transfer Test Facility A", region: "Transfer Test Region", address: "A St", status: "ACTIVE" },
    { id: crypto.randomUUID(), name: "Transfer Test Facility B", region: "Transfer Test Region", address: "B St", status: "ACTIVE" },
    { id: crypto.randomUUID(), name: "Transfer Out Of Region", region: "Elsewhere", address: "C St", status: "ACTIVE" },
  ]).returning();
  facilityAId = facRows[0]!.id;
  facilityBId = facRows[1]!.id;
  outOfRegionFacilityId = facRows[2]!.id;

  const patientRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: `TR-${Date.now()}`, firstName: "Transfer", lastName: "Test",
    dob: "1990-01-01", gender: "Other", phone: "+2348000000001", email: `transfer-patient-${Date.now()}@test.com`,
    facilityId: facilityAId,
  }).returning();
  testPatientId = patientRows[0]!.id;

  const admin = await createSessionCookie();
  regionalAdminCookie = admin.cookie;
  const regionalAdminRoleRow = await db.select().from(role).where(eq(role.name, "REGIONAL_ADMIN")).limit(1);
  await db.insert(userRole).values({ userId: admin.userId, roleId: regionalAdminRoleRow[0]!.id });

  const plain = await createSessionCookie();
  plainCookie = plain.cookie;
});

describe("POST /transfers", () => {
  it("rejects a caller without transferRequest:create", async () => {
    const res = await request(app).post("/transfers").set("Cookie", plainCookie).send({
      patientId: testPatientId, fromFacilityId: facilityAId, toFacilityId: facilityBId,
    });
    expect(res.status).toBe(403);
  });

  it("initiates a transfer request as PENDING", async () => {
    const res = await request(app).post("/transfers").set("Cookie", regionalAdminCookie).send({
      patientId: testPatientId, fromFacilityId: facilityAId, toFacilityId: facilityBId,
    });
    expect(res.status).toBe(201);
    expect(res.body.transfer.status).toBe("PENDING");
    expect(res.body.transfer.approvedBy).toBeNull();
  });
});

describe("GET /transfers", () => {
  it("rejects a caller without transferRequest:read", async () => {
    const res = await request(app).get("/transfers?region=Transfer Test Region").set("Cookie", plainCookie);
    expect(res.status).toBe(403);
  });

  it("lists transfers where either facility is in the requested region", async () => {
    const res = await request(app).get("/transfers?region=Transfer Test Region").set("Cookie", regionalAdminCookie);
    expect(res.status).toBe(200);
    expect(res.body.transfers.some((t: { patientId: string }) => t.patientId === testPatientId)).toBe(true);
  });

  it("excludes transfers entirely outside the requested region", async () => {
    const res = await request(app).get("/transfers?region=Elsewhere").set("Cookie", regionalAdminCookie);
    expect(res.status).toBe(200);
    expect(res.body.transfers.some((t: { patientId: string }) => t.patientId === testPatientId)).toBe(false);
  });

  it("still surfaces a transfer whose destination (not origin) is in-region", async () => {
    await request(app).post("/transfers").set("Cookie", regionalAdminCookie).send({
      patientId: testPatientId, fromFacilityId: outOfRegionFacilityId, toFacilityId: facilityAId,
    });
    const res = await request(app).get("/transfers?region=Transfer Test Region").set("Cookie", regionalAdminCookie);
    expect(res.body.transfers.some((t: { fromFacilityId: string }) => t.fromFacilityId === outOfRegionFacilityId)).toBe(true);
  });
});
