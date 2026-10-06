import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { user, session, role, userRole } from "../../auth/schema.js";
import { shiftRequirement, shiftAssignment } from "../schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { seedIdentity } from "../../../seed/identity.js";

const app = createApp();

let testFacilityId: string;
let nurseUserId: string;
let nurseCookie: string;
let regionalAdminCookie: string;
let plainCookie: string;

// Creates a user and returns a valid session cookie for requests.
async function createSessionCookie(): Promise<{ userId: string; cookie: string }> {
  const userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId, email: `staffing-${crypto.randomUUID()}@test.com`, passwordHash: "test",
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

  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Staffing Test Facility", region: "Test Region", address: "S St", status: "ACTIVE",
  }).returning();
  testFacilityId = facRows[0]!.id;

  await db.insert(shiftRequirement).values({
    id: crypto.randomUUID(), facilityId: testFacilityId, weekday: 0, requiredCount: 2,
  });

  const admin = await createSessionCookie();
  regionalAdminCookie = admin.cookie;
  const regionalAdminRoleRow = await db.select().from(role).where(eq(role.name, "REGIONAL_ADMIN")).limit(1);
  await db.insert(userRole).values({ userId: admin.userId, roleId: regionalAdminRoleRow[0]!.id });

  const plain = await createSessionCookie();
  plainCookie = plain.cookie;

  const nurse = await createSessionCookie();
  nurseUserId = nurse.userId;
  nurseCookie = nurse.cookie;
  await db.update(user).set({ facilityId: testFacilityId }).where(eq(user.id, nurseUserId));
  const nursingRoleRow = await db.select().from(role).where(eq(role.name, "ONSITE_NURSING_OFFICER")).limit(1);
  await db.insert(userRole).values({ userId: nurseUserId, roleId: nursingRoleRow[0]!.id });
});

describe("GET /staffing/week", () => {
  it("rejects a caller without staffing:read", async () => {
    const res = await request(app).get("/staffing/week?isoYear=2026&isoWeek=1").set("Cookie", plainCookie);
    expect(res.status).toBe(403);
  });

  it("400s without isoYear/isoWeek", async () => {
    const res = await request(app).get("/staffing/week").set("Cookie", regionalAdminCookie);
    expect(res.status).toBe(400);
  });

  it("returns the requirement with zero assigned before any assignment exists", async () => {
    const res = await request(app).get("/staffing/week?isoYear=2026&isoWeek=1").set("Cookie", regionalAdminCookie);
    expect(res.status).toBe(200);
    const row = res.body.facilities.find((f: { facility: { id: string } }) => f.facility.id === testFacilityId);
    expect(row).toBeDefined();
    const monday = row.weekdays.find((d: { weekday: number }) => d.weekday === 0);
    expect(monday.requiredCount).toBe(2);
    expect(monday.assigned).toEqual([]);
  });

  it("scopes to the requested region only", async () => {
    const res = await request(app).get("/staffing/week?isoYear=2026&isoWeek=1&region=Test Region").set("Cookie", regionalAdminCookie);
    expect(res.status).toBe(200);
    expect(res.body.facilities.every((f: { facility: { region: string } }) => f.facility.region === "Test Region")).toBe(true);

    const otherRegion = await request(app).get("/staffing/week?isoYear=2026&isoWeek=1&region=Nonexistent").set("Cookie", regionalAdminCookie);
    expect(otherRegion.body.facilities).toEqual([]);
  });
});

describe("GET /staffing/eligible-nurses", () => {
  it("returns only Onsite Nursing Officers at the given facility", async () => {
    const res = await request(app).get(`/staffing/eligible-nurses?facilityId=${testFacilityId}`).set("Cookie", regionalAdminCookie);
    expect(res.status).toBe(200);
    expect(res.body.nurses.some((n: { id: string }) => n.id === nurseUserId)).toBe(true);
  });
});

describe("POST /staffing/assignments + /staffing/publish", () => {
  it("rejects a caller without staffing:update", async () => {
    const res = await request(app).post("/staffing/assignments").set("Cookie", plainCookie).send({
      facilityId: testFacilityId, weekday: 0, isoYear: 2026, isoWeek: 2, userId: nurseUserId,
    });
    expect(res.status).toBe(403);
  });

  it("creates an assignment and it shows up in the week overview as unpublished", async () => {
    const createRes = await request(app).post("/staffing/assignments").set("Cookie", regionalAdminCookie).send({
      facilityId: testFacilityId, weekday: 0, isoYear: 2026, isoWeek: 2, userId: nurseUserId,
    });
    expect(createRes.status).toBe(201);

    const weekRes = await request(app).get("/staffing/week?isoYear=2026&isoWeek=2").set("Cookie", regionalAdminCookie);
    const row = weekRes.body.facilities.find((f: { facility: { id: string } }) => f.facility.id === testFacilityId);
    const monday = row.weekdays.find((d: { weekday: number }) => d.weekday === 0);
    expect(monday.assigned).toHaveLength(1);
    expect(monday.assigned[0].userId).toBe(nurseUserId);
    expect(monday.assigned[0].published).toBe(false);
  });

  it("refuses to assign the same nurse to the same shift twice, but allows another day", async () => {
    const body = { facilityId: testFacilityId, weekday: 0, isoYear: 2026, isoWeek: 2, userId: nurseUserId };
    const dup = await request(app).post("/staffing/assignments").set("Cookie", regionalAdminCookie).send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.error).toContain("already assigned");

    const otherDay = await request(app).post("/staffing/assignments").set("Cookie", regionalAdminCookie).send({ ...body, weekday: 3 });
    expect(otherDay.status).toBe(201);
  });

  it("refuses to roster a nurse at a facility other than their own, and hides legacy cross-support from the nurse", async () => {
    const otherFacility = (await db.insert(facility).values({
      id: crypto.randomUUID(), name: "Staffing Other Facility", region: "Test Region", address: "S2 St", status: "ACTIVE",
    }).returning())[0]!.id;
    const cross = await request(app).post("/staffing/assignments").set("Cookie", regionalAdminCookie).send({
      facilityId: otherFacility, weekday: 1, isoYear: 2026, isoWeek: 2, userId: nurseUserId,
    });
    expect(cross.status).toBe(409);
    expect(cross.body.error).toContain("Cross-facility");

    // A row from before the change (written directly) is published but never shown to the nurse.
    await db.insert(shiftAssignment).values({
      id: crypto.randomUUID(), facilityId: otherFacility, weekday: 1, isoYear: 2026, isoWeek: 2, userId: nurseUserId,
      assignedBy: nurseUserId, assignedAt: new Date(), publishedAt: new Date(),
    });
    await db.insert(shiftAssignment).values({
      id: crypto.randomUUID(), facilityId: testFacilityId, weekday: 2, isoYear: 2026, isoWeek: 2, userId: nurseUserId,
      assignedBy: nurseUserId, assignedAt: new Date(), publishedAt: new Date(),
    });
    const mine = await request(app).get("/staffing/mine?isoYear=2026&isoWeek=2").set("Cookie", nurseCookie);
    expect(mine.status).toBe(200);
    expect(mine.body.assignments.map((a: { facilityId: string }) => a.facilityId)).toEqual([testFacilityId]);
  });

  it("publishing the week marks the draft assignment published", async () => {
    const publishRes = await request(app).post("/staffing/publish").set("Cookie", regionalAdminCookie).send({
      isoYear: 2026, isoWeek: 2, region: "Test Region",
    });
    expect(publishRes.status).toBe(200);
    expect(publishRes.body.published).toBeGreaterThanOrEqual(1);

    const weekRes = await request(app).get("/staffing/week?isoYear=2026&isoWeek=2").set("Cookie", regionalAdminCookie);
    const row = weekRes.body.facilities.find((f: { facility: { id: string } }) => f.facility.id === testFacilityId);
    const monday = row.weekdays.find((d: { weekday: number }) => d.weekday === 0);
    expect(monday.assigned[0].published).toBe(true);
  });

  it("re-publishing the same week is a no-op (only touches still-draft rows)", async () => {
    const res = await request(app).post("/staffing/publish").set("Cookie", regionalAdminCookie).send({
      isoYear: 2026, isoWeek: 2, region: "Test Region",
    });
    expect(res.status).toBe(200);
    expect(res.body.published).toBe(0);
  });
});
