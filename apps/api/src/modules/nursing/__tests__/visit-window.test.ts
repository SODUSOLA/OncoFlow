import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { user, session, role, userRole } from "../../auth/schema.js";
import { patient } from "../../patient/schema.js";
import { regimen, regimenCycle } from "../../clinical-metrics/schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { seedIdentity } from "../../../seed/identity.js";

const app = createApp();

let facilityId: string;
let otherFacilityId: string;
let nurse: { id: string; cookie: string };
let superAdmin: { id: string; cookie: string };

async function createUser(roleName: string, facilityId_: string | null): Promise<{ id: string; cookie: string }> {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, email: `vw-${crypto.randomUUID()}@test.com`, passwordHash: "test", facilityId: facilityId_ });
  const roleRow = await db.select().from(role).where(eq(role.name, roleName as never)).limit(1);
  await db.insert(userRole).values({ userId: id, roleId: roleRow[0]!.id });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId: id, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  return { id, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

// The Lagos calendar day offset by n days, matching how the server computes the window.
function lagosDay(offset: number): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
  now.setDate(now.getDate() + offset);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// A patient at the given facility with one SCHEDULED cycle `offset` days from today.
async function scheduledPatient(offset: number, atFacility = facilityId): Promise<{ patientId: string; cycleId: string; name: string }> {
  const patientId = crypto.randomUUID();
  const name = `Win${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(patient).values({
    id: patientId, uniquePatientId: "VW-" + crypto.randomUUID().slice(0, 8).toUpperCase(), firstName: name, lastName: "Window",
    dob: "1980-01-01", gender: "Female", phone: "+2348012340003", email: `vw.${crypto.randomUUID().slice(0, 6)}@example.com`,
    facilityId: atFacility, status: "ACTIVE",
  });
  const regimenId = crypto.randomUUID();
  await db.insert(regimen).values({
    id: regimenId, patientId, drugName: "Test", protocolCode: "T-1", diagnosis: "Breast cancer, stage II",
    totalCycles: 4, cycleIntervalDays: 21, startedAt: new Date(),
  });
  const cycleId = crypto.randomUUID();
  await db.insert(regimenCycle).values({ id: cycleId, regimenId, cycleNumber: 1, scheduledDate: lagosDay(offset) });
  return { patientId, cycleId, name };
}

beforeAll(async () => {
  await seedIdentity();
  const facs = await db.insert(facility).values([
    { id: crypto.randomUUID(), name: `VW Facility ${crypto.randomUUID().slice(0, 6)}`, region: "VW Region", address: "VW St", status: "ACTIVE" },
    { id: crypto.randomUUID(), name: `VW Other ${crypto.randomUUID().slice(0, 6)}`, region: "VW Region", address: "VW St", status: "ACTIVE" },
  ]).returning();
  facilityId = facs[0]!.id;
  otherFacilityId = facs[1]!.id;
  nurse = await createUser("ONSITE_NURSING_OFFICER", facilityId);
  superAdmin = await createUser("SUPER_ADMIN", null);
});

describe("nurse read window (D-1 to D+1)", () => {
  it.each([-1, 0, 1])("lets the nurse read a patient scheduled %i days from today", async (offset) => {
    const { patientId } = await scheduledPatient(offset);
    const res = await request(app).get(`/patients/${patientId}`).set("Cookie", nurse.cookie);
    expect(res.status).toBe(200);
  });

  it.each([-2, 2, 30])("refuses a patient whose only cycle is %i days away, across every read surface", async (offset) => {
    const { patientId } = await scheduledPatient(offset);
    for (const path of [
      `/patients/${patientId}`,
      `/patients/${patientId}/timeline`,
      `/regimen?patientId=${patientId}`,
      `/vitals/latest?patientId=${patientId}`,
      `/clinical-metrics/current?patientId=${patientId}`,
      `/lab-documents?patientId=${patientId}`,
      `/files?patientId=${patientId}`,
      `/nursing-cases?patientId=${patientId}`,
    ]) {
      const res = await request(app).get(path).set("Cookie", nurse.cookie);
      expect(res.status, path).toBe(403);
    }
  });

  it("refuses an in-window patient who belongs to a different facility", async () => {
    const { patientId } = await scheduledPatient(0, otherFacilityId);
    const res = await request(app).get(`/patients/${patientId}`).set("Cookie", nurse.cookie);
    expect(res.status).toBe(403);
  });

  it("keeps a visit in progress readable even after its date slips out of the window", async () => {
    const { patientId, cycleId } = await scheduledPatient(0);
    const started = await request(app).post("/nursing-cases").set("Cookie", nurse.cookie).send({ patientId, regimenCycleId: cycleId });
    expect(started.status).toBe(201);
    await db.update(regimenCycle).set({ scheduledDate: lagosDay(-5) }).where(eq(regimenCycle.id, cycleId));
    expect((await request(app).get(`/patients/${patientId}`).set("Cookie", nurse.cookie)).status).toBe(200);
  });

  it("filters patient search and the due schedule to the window", async () => {
    const inside = await scheduledPatient(1);
    const outside = await scheduledPatient(-4);
    const search = await request(app).get("/patients").query({ q: "Window", facilityId }).set("Cookie", nurse.cookie);
    expect(search.status).toBe(200);
    const ids = search.body.patients.map((p: { id: string }) => p.id);
    expect(ids).toContain(inside.patientId);
    expect(ids).not.toContain(outside.patientId);

    const due = await request(app).get("/regimen-cycles").query({ facilityId, date: lagosDay(1), due: "true" }).set("Cookie", nurse.cookie);
    expect(due.status).toBe(200);
    const dueIds = due.body.cycles.map((c: { patientId: string }) => c.patientId);
    expect(dueIds).toContain(inside.patientId);
    expect(dueIds).not.toContain(outside.patientId);
  });

  it("hides a stale cycle even when the same patient has another cycle inside the window", async () => {
    const { patientId, cycleId: todayCycle } = await scheduledPatient(0);
    const [reg] = await db.select().from(regimen).where(eq(regimen.patientId, patientId));
    const staleCycle = crypto.randomUUID();
    await db.insert(regimenCycle).values({ id: staleCycle, regimenId: reg!.id, cycleNumber: 0, scheduledDate: lagosDay(-6) });
    const due = await request(app).get("/regimen-cycles").query({ facilityId, date: lagosDay(0), due: "true" }).set("Cookie", nurse.cookie);
    const ids = due.body.cycles.map((c: { id: string }) => c.id);
    expect(ids).toContain(todayCycle);
    expect(ids).not.toContain(staleCycle);
  });

  it("does not restrict other staff roles", async () => {
    const { patientId } = await scheduledPatient(30);
    const res = await request(app).get(`/patients/${patientId}`).set("Cookie", superAdmin.cookie);
    expect(res.status).toBe(200);
  });
});
