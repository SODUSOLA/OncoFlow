import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { user, session, role, userRole } from "../../auth/schema.js";
import { patient } from "../schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { seedIdentity } from "../../../seed/identity.js";
import { regimen, regimenCycle } from "../../clinical-metrics/schema.js";
import { nursingCase } from "../../nursing/schema.js";
import type { roleNameEnum } from "../../../db/enums.js";

const app = createApp();

let testPatientId: string;
let regionalAdminCookie: string;
let onsiteNursingOfficerCookie: string;
let nurseId: string;
let plainCookie: string;

// Creates a user and returns a valid session cookie for requests.
async function createSessionCookie(): Promise<{ userId: string; cookie: string }> {
  const userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId, email: `call-${crypto.randomUUID()}@test.com`, passwordHash: "test",
  });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  return { userId, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

// Assigns the named role to a user.
async function assignRole(userId: string, roleName: (typeof roleNameEnum.enumValues)[number]) {
  const roleRow = await db.select().from(role).where(eq(role.name, roleName)).limit(1);
  await db.insert(userRole).values({ userId, roleId: roleRow[0]!.id });
}

beforeAll(async () => {
  // Uses real per-role grants, not the SUPER_ADMIN bypass, to prove only REGIONAL_ADMIN and ONSITE_NURSING_OFFICER get through.
  await seedIdentity();

  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Call Test Facility", region: "Lagos", address: "C St", status: "ACTIVE",
  }).returning();

  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "CALL-TEST-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    firstName: "Call", lastName: "Test", dob: "1990-01-01", gender: "Male",
    phone: "+2348012345678", email: "call.test." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: facRows[0]!.id, status: "ACTIVE",
  }).returning();
  testPatientId = patRows[0]!.id;

  const admin = await createSessionCookie();
  regionalAdminCookie = admin.cookie;
  await assignRole(admin.userId, "REGIONAL_ADMIN");

  const nurse = await createSessionCookie();
  onsiteNursingOfficerCookie = nurse.cookie;
  nurseId = nurse.userId;
  await assignRole(nurse.userId, "ONSITE_NURSING_OFFICER");

  const plain = await createSessionCookie();
  plainCookie = plain.cookie;
  await assignRole(plain.userId, "CONSULTING_ONCOLOGIST");
});

describe("POST /patients/:id/call", () => {
  it("rejects a role without patient:call", async () => {
    const res = await request(app).post(`/patients/${testPatientId}/call`).set("Cookie", plainCookie);
    expect(res.status).toBe(403);
  });

  it("returns 502 'not configured' for REGIONAL_ADMIN (no telephony vendor wired up)", async () => {
    const res = await request(app).post(`/patients/${testPatientId}/call`).set("Cookie", regionalAdminCookie);
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("Calling not configured — no telephony vendor integrated yet");
  });

  it("returns 502 'not configured' for ONSITE_NURSING_OFFICER too", async () => {
    const res = await request(app).post(`/patients/${testPatientId}/call`).set("Cookie", onsiteNursingOfficerCookie);
    expect(res.status).toBe(502);
  });

  it("refuses a nursing officer once their case with the patient is closed, but not Regional Admin, and allows again with a new open case", async () => {
    const regimenId = crypto.randomUUID();
    await db.insert(regimen).values({ id: regimenId, patientId: testPatientId, drugName: "T", protocolCode: "T", totalCycles: 2, cycleIntervalDays: 7, startedAt: new Date() });
    const newCycle = async (n: number) => {
      const id = crypto.randomUUID();
      await db.insert(regimenCycle).values({ id, regimenId, cycleNumber: n, scheduledDate: new Date().toISOString().slice(0, 10) });
      return id;
    };
    const openCase = crypto.randomUUID();
    await db.insert(nursingCase).values({ id: openCase, patientId: testPatientId, regimenCycleId: await newCycle(1), startedBy: nurseId, status: "STARTED", startedAt: new Date(Date.now() - 60_000) });

    // Open case: passes the check (reaches the "not configured" vendor stub).
    expect((await request(app).post(`/patients/${testPatientId}/call`).set("Cookie", onsiteNursingOfficerCookie)).status).toBe(502);

    await db.update(nursingCase).set({ status: "CLOSED", closedAt: new Date() }).where(eq(nursingCase.id, openCase));
    const blocked = await request(app).post(`/patients/${testPatientId}/call`).set("Cookie", onsiteNursingOfficerCookie);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toContain("closed");
    expect((await request(app).post(`/patients/${testPatientId}/call`).set("Cookie", regionalAdminCookie)).status).toBe(502);

    await db.insert(nursingCase).values({ id: crypto.randomUUID(), patientId: testPatientId, regimenCycleId: await newCycle(2), startedBy: nurseId, status: "STARTED" });
    expect((await request(app).post(`/patients/${testPatientId}/call`).set("Cookie", onsiteNursingOfficerCookie)).status).toBe(502);
  });

  it("never includes the patient's phone number in the response body", async () => {
    const res = await request(app).post(`/patients/${testPatientId}/call`).set("Cookie", regionalAdminCookie);
    expect(JSON.stringify(res.body)).not.toContain("+2348012345678");
    expect(res.body.phone).toBeUndefined();
  });
});
