import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { user, session, role, userRole } from "../../auth/schema.js";
import { serviceClassification, tariff } from "../schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { seedIdentity } from "../../../seed/identity.js";

const app = createApp();

let testFacilityId: string;
let regionalAdminCookie: string;
let plainCookie: string;

async function createSessionCookie(): Promise<{ userId: string; cookie: string }> {
  const userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId, email: `tariff-${crypto.randomUUID()}@test.com`, passwordHash: "test",
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
    id: crypto.randomUUID(), name: "Tariff Test Facility", region: "Lagos", address: "T St", status: "ACTIVE",
  }).returning();
  testFacilityId = facRows[0]!.id;

  const classRows = await db.insert(serviceClassification).values({
    id: crypto.randomUUID(), name: "PROCEDURE", cappedNetworkFeeKobo: 800000n,
  }).onConflictDoNothing().returning();
  const classId = classRows[0]
    ? classRows[0].id
    : (await db.select().from(serviceClassification).where(eq(serviceClassification.name, "PROCEDURE")).limit(1))[0]!.id;

  await db.insert(tariff).values({
    id: crypto.randomUUID(), facilityId: testFacilityId, classificationId: classId,
    networkFeeKobo: 800000n, facilityBedFeeKobo: 480000n, professionalFeeKobo: 320000n, drugPriceKobo: 240000n,
  });

  const admin = await createSessionCookie();
  regionalAdminCookie = admin.cookie;
  const regionalAdminRoleRow = await db.select().from(role).where(eq(role.name, "REGIONAL_ADMIN")).limit(1);
  await db.insert(userRole).values({ userId: admin.userId, roleId: regionalAdminRoleRow[0]!.id });

  const plain = await createSessionCookie();
  plainCookie = plain.cookie;
});

describe("GET /tariffs", () => {
  it("rejects a caller without tariff:read", async () => {
    const res = await request(app).get(`/tariffs?facilityId=${testFacilityId}`).set("Cookie", plainCookie);
    expect(res.status).toBe(403);
  });

  it("returns the facility's tariffs with all 4 fee components for REGIONAL_ADMIN", async () => {
    const res = await request(app).get(`/tariffs?facilityId=${testFacilityId}`).set("Cookie", regionalAdminCookie);
    expect(res.status).toBe(200);
    expect(res.body.tariffs.length).toBeGreaterThanOrEqual(1);
    const t = res.body.tariffs[0];
    expect(t).toHaveProperty("networkFeeKobo");
    expect(t).toHaveProperty("facilityBedFeeKobo");
    expect(t).toHaveProperty("professionalFeeKobo");
    expect(t).toHaveProperty("drugPriceKobo");
    expect(t.professionalFeeKobo).toBe("320000");
  });

  it("400s without a facilityId query param", async () => {
    const res = await request(app).get("/tariffs").set("Cookie", regionalAdminCookie);
    expect(res.status).toBe(400);
  });
});
