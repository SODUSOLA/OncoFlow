import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { user, session, role, userRole } from "../../auth/schema.js";
import { patient } from "../../patient/schema.js";
import { regimen, regimenCycle } from "../schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { seedIdentity } from "../../../seed/identity.js";

const app = createApp();
let facilityId: string;
let nurseCookie: string;
const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

// Creates a user with the given role and facility, returning a valid session cookie.
async function createUser(roleName: string, facilityId_: string): Promise<{ cookie: string }> {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, email: `regimen-${crypto.randomUUID()}@test.com`, passwordHash: "test", facilityId: facilityId_ });
  const roleRow = await db.select().from(role).where(eq(role.name, roleName as never)).limit(1);
  await db.insert(userRole).values({ userId: id, roleId: roleRow[0]!.id });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId: id, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  return { cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

// Creates a patient with one regimen cycle scheduled on the given date and status, returning the cycle id.
async function createCycle(scheduledDate: string, status: "SCHEDULED" | "COMPLETED" | "SKIPPED" = "SCHEDULED"): Promise<string> {
  const patientId = crypto.randomUUID();
  await db.insert(patient).values({
    id: patientId, uniquePatientId: "RC-" + crypto.randomUUID().slice(0, 8).toUpperCase(), firstName: "Regimen", lastName: "Cycle",
    dob: "1990-01-01", gender: "Male", phone: "+2348012340001", email: `rc.${crypto.randomUUID().slice(0, 6)}@example.com`,
    facilityId, status: "ACTIVE",
  });
  const regimenId = crypto.randomUUID();
  await db.insert(regimen).values({
    id: regimenId, patientId, drugName: "Test", protocolCode: "T-1", totalCycles: 4, cycleIntervalDays: 21, startedAt: new Date(),
  });
  const cycleId = crypto.randomUUID();
  await db.insert(regimenCycle).values({ id: cycleId, regimenId, cycleNumber: 1, scheduledDate, status });
  return cycleId;
}

beforeAll(async () => {
  await seedIdentity();
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: `Regimen Cycle Facility ${crypto.randomUUID().slice(0, 6)}`, region: "Regimen Region", address: "RC St", status: "ACTIVE",
  }).returning();
  facilityId = facRows[0]!.id;
  nurseCookie = (await createUser("ONSITE_NURSING_OFFICER", facilityId)).cookie;
});

describe("GET /regimen-cycles", () => {
  it("matches only the exact date by default, any status", async () => {
    const todayId = await createCycle(days(0));
    await createCycle(days(0), "COMPLETED");
    await createCycle(days(-2));
    const res = await request(app).get(`/regimen-cycles?facilityId=${facilityId}&date=${days(0)}`).set("Cookie", nurseCookie);
    expect(res.status).toBe(200);
    const ids: string[] = res.body.cycles.map((c: { id: string }) => c.id);
    expect(ids).toContain(todayId);
    expect(ids.every((id: string) => res.body.cycles.find((c: { id: string }) => c.id === id).scheduledDate === days(0))).toBe(true);
  });

  it("with due=true includes today's and yesterday's SCHEDULED cycles, never future, resolved or beyond-the-window ones", async () => {
    // A nurse's schedule is limited to the D-1..D+1 visit window, so a cycle missed three days ago drops out.
    const staleId = await createCycle(days(-3));
    const overdueId = await createCycle(days(-1));
    const todayId = await createCycle(days(0));
    const completedId = await createCycle(days(-1), "COMPLETED");
    const skippedId = await createCycle(days(-1), "SKIPPED");
    const futureId = await createCycle(days(1));

    const res = await request(app).get(`/regimen-cycles?facilityId=${facilityId}&date=${days(0)}&due=true`).set("Cookie", nurseCookie);
    expect(res.status).toBe(200);
    const ids: string[] = res.body.cycles.map((c: { id: string }) => c.id);
    expect(ids).toContain(overdueId);
    expect(ids).toContain(todayId);
    expect(ids).not.toContain(completedId);
    expect(ids).not.toContain(skippedId);
    expect(ids).not.toContain(futureId);
    expect(ids).not.toContain(staleId);

    // Oldest overdue first, so a nurse clears the backlog before today's.
    const overdueIndex = ids.indexOf(overdueId);
    const todayIndex = ids.indexOf(todayId);
    expect(overdueIndex).toBeLessThan(todayIndex);
  });

  it("still refuses a caller asking for a different facility's schedule", async () => {
    const otherFacility = (await db.insert(facility).values({
      id: crypto.randomUUID(), name: `Other Regimen Facility ${crypto.randomUUID().slice(0, 6)}`, region: "Elsewhere", address: "OR St", status: "ACTIVE",
    }).returning())[0]!.id;
    const res = await request(app).get(`/regimen-cycles?facilityId=${otherFacility}&date=${days(0)}&due=true`).set("Cookie", nurseCookie);
    expect(res.status).toBe(403);
  });
});
