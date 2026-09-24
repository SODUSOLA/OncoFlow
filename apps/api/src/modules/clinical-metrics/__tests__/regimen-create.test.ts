import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { user, session, role, userRole } from "../../auth/schema.js";
import { patient } from "../../patient/schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { seedIdentity } from "../../../seed/identity.js";

const app = createApp();
let facilityId: string;
let consultant: { cookie: string };
let nurse: { cookie: string };

// Creates a user with the given role and facility, returning a valid session cookie.
async function createUser(roleName: string, facilityId_: string): Promise<{ cookie: string }> {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, email: `regcreate-${crypto.randomUUID()}@test.com`, passwordHash: "test", facilityId: facilityId_ });
  const roleRow = await db.select().from(role).where(eq(role.name, roleName as never)).limit(1);
  await db.insert(userRole).values({ userId: id, roleId: roleRow[0]!.id });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId: id, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  return { cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

// Creates a bare patient with no regimen.
async function createPatient(): Promise<string> {
  const patientId = crypto.randomUUID();
  await db.insert(patient).values({
    id: patientId, uniquePatientId: "RG-" + crypto.randomUUID().slice(0, 8).toUpperCase(), firstName: "Regimen", lastName: "New",
    dob: "1975-01-01", gender: "Male", phone: "+2348012340003", email: `rg.${crypto.randomUUID().slice(0, 6)}@example.com`,
    facilityId, status: "ACTIVE",
  });
  return patientId;
}

beforeAll(async () => {
  await seedIdentity();
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: `Regimen Create Facility ${crypto.randomUUID().slice(0, 6)}`, region: "Regimen Create Region", address: "RG St", status: "ACTIVE",
  }).returning();
  facilityId = facRows[0]!.id;
  consultant = await createUser("CONSULTING_ONCOLOGIST", facilityId);
  nurse = await createUser("ONSITE_NURSING_OFFICER", facilityId);
});

describe("POST /regimen", () => {
  it("lets a consultant prescribe a regimen and generates its cycles", async () => {
    const patientId = await createPatient();
    const res = await request(app).post("/regimen").set("Cookie", consultant.cookie).send({
      patientId, drugName: "Pembrolizumab", protocolCode: "PEM-Q3W", diagnosis: "Breast cancer, stage II",
      totalCycles: 3, cycleIntervalDays: 21, startedAt: "2026-01-01",
    });
    expect(res.status).toBe(201);
    expect(res.body.regimen).toMatchObject({ drugName: "Pembrolizumab", diagnosis: "Breast cancer, stage II", status: "ACTIVE" });
    expect(res.body.cycles).toHaveLength(3);
    const dates = res.body.cycles.map((c: { cycleNumber: number; scheduledDate: string }) => [c.cycleNumber, c.scheduledDate]);
    expect(dates).toEqual([[1, "2026-01-01"], [2, "2026-01-22"], [3, "2026-02-12"]]);

    const fetched = await request(app).get(`/regimen?patientId=${patientId}`).set("Cookie", consultant.cookie);
    expect(fetched.body.regimen).toMatchObject({ diagnosis: "Breast cancer, stage II", currentCycleNumber: 1 });
  });

  it("refuses a second concurrent ACTIVE regimen for the same patient", async () => {
    const patientId = await createPatient();
    const first = await request(app).post("/regimen").set("Cookie", consultant.cookie).send({
      patientId, drugName: "Drug A", protocolCode: "A-1", diagnosis: "Diagnosis A",
      totalCycles: 2, cycleIntervalDays: 14, startedAt: "2026-01-01",
    });
    expect(first.status).toBe(201);

    const second = await request(app).post("/regimen").set("Cookie", consultant.cookie).send({
      patientId, drugName: "Drug B", protocolCode: "B-1", diagnosis: "Diagnosis B",
      totalCycles: 2, cycleIntervalDays: 14, startedAt: "2026-02-01",
    });
    expect(second.status).toBe(400);
  });

  it("refuses a caller without regimen:create (a nurse can read regimens but not prescribe one)", async () => {
    const patientId = await createPatient();
    const res = await request(app).post("/regimen").set("Cookie", nurse.cookie).send({
      patientId, drugName: "Drug C", protocolCode: "C-1", diagnosis: "Diagnosis C",
      totalCycles: 2, cycleIntervalDays: 14, startedAt: "2026-01-01",
    });
    expect(res.status).toBe(403);
  });
});
