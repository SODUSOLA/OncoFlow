import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { user, session, role, userRole } from "../../auth/schema.js";
import { drug, inventory, reconciliationRecord } from "../schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { seedIdentity } from "../../../seed/identity.js";

const app = createApp();

let testFacilityId: string;
let testDrugId: string;
let regionalAdminCookie: string;
let plainCookie: string;

async function createSessionCookie(): Promise<{ userId: string; cookie: string }> {
  const userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId, email: `inventory-${crypto.randomUUID()}@test.com`, passwordHash: "test",
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
    id: crypto.randomUUID(), name: "Inventory Test Facility", region: "Inventory Test Region", address: "I St", status: "ACTIVE",
  }).returning();
  testFacilityId = facRows[0]!.id;

  const drugRows = await db.insert(drug).values({
    id: crypto.randomUUID(), name: "Test Cyclophosphamide", strength: "500mg", category: "Chemotherapy",
  }).returning();
  testDrugId = drugRows[0]!.id;

  await db.insert(inventory).values({
    id: crypto.randomUUID(), facilityId: testFacilityId, drugId: testDrugId, quantity: 10,
  });

  await db.insert(reconciliationRecord).values({
    id: crypto.randomUUID(), facilityId: testFacilityId, weekEnding: "2026-08-14",
    expectedQty: 42, actualQty: 38, variance: -4, status: "VARIANCE_FLAGGED",
  });

  const admin = await createSessionCookie();
  regionalAdminCookie = admin.cookie;
  const regionalAdminRoleRow = await db.select().from(role).where(eq(role.name, "REGIONAL_ADMIN")).limit(1);
  await db.insert(userRole).values({ userId: admin.userId, roleId: regionalAdminRoleRow[0]!.id });

  const plain = await createSessionCookie();
  plainCookie = plain.cookie;
});

describe("GET /inventory/overview", () => {
  it("rejects a caller without inventory:read", async () => {
    const res = await request(app).get("/inventory/overview").set("Cookie", plainCookie);
    expect(res.status).toBe(403);
  });

  it("returns stock and open variances scoped to the requested region", async () => {
    const res = await request(app).get("/inventory/overview?region=Inventory Test Region").set("Cookie", regionalAdminCookie);
    expect(res.status).toBe(200);
    const stockRow = res.body.stock.find((s: { facilityId: string; drugId: string }) => s.facilityId === testFacilityId && s.drugId === testDrugId);
    expect(stockRow).toBeDefined();
    expect(stockRow.quantity).toBe(10);
    expect(res.body.variancesOpen).toBeGreaterThanOrEqual(1);
    expect(res.body.variances.some((v: { facilityId: string }) => v.facilityId === testFacilityId)).toBe(true);
  });

  it("excludes facilities outside the requested region", async () => {
    const res = await request(app).get("/inventory/overview?region=Nonexistent Region").set("Cookie", regionalAdminCookie);
    expect(res.status).toBe(200);
    expect(res.body.stock.some((s: { facilityId: string }) => s.facilityId === testFacilityId)).toBe(false);
  });
});

describe("POST /inventory/movements", () => {
  it("rejects a caller without inventory:update", async () => {
    const res = await request(app).post("/inventory/movements").set("Cookie", plainCookie).send({
      facilityId: testFacilityId, drugId: testDrugId, quantity: 5, movementType: "PURCHASE",
    });
    expect(res.status).toBe(403);
  });

  it("PURCHASE increases the facility's stock quantity", async () => {
    const res = await request(app).post("/inventory/movements").set("Cookie", regionalAdminCookie).send({
      facilityId: testFacilityId, drugId: testDrugId, quantity: 5, movementType: "PURCHASE",
    });
    expect(res.status).toBe(201);
    expect(res.body.inventory.quantity).toBe(15);
  });

  it("DISPATCH decreases the facility's stock quantity", async () => {
    const res = await request(app).post("/inventory/movements").set("Cookie", regionalAdminCookie).send({
      facilityId: testFacilityId, drugId: testDrugId, quantity: 3, movementType: "DISPATCH",
    });
    expect(res.status).toBe(201);
    expect(res.body.inventory.quantity).toBe(12);
  });

  it("creates a new inventory row for the regional pool (null facilityId) on first movement", async () => {
    const res = await request(app).post("/inventory/movements").set("Cookie", regionalAdminCookie).send({
      drugId: testDrugId, quantity: 20, movementType: "PURCHASE",
    });
    expect(res.status).toBe(201);
    expect(res.body.inventory.facilityId).toBeNull();
    expect(res.body.inventory.quantity).toBe(20);
  });
});

describe("POST /inventory/reconciliations/:id/resolve", () => {
  it("marks the variance resolved", async () => {
    const overview = await request(app).get("/inventory/overview?region=Inventory Test Region").set("Cookie", regionalAdminCookie);
    const varianceId = overview.body.variances[0].id;

    const res = await request(app).post(`/inventory/reconciliations/${varianceId}/resolve`).set("Cookie", regionalAdminCookie);
    expect(res.status).toBe(200);
    expect(res.body.record.status).toBe("RESOLVED");

    const after = await request(app).get("/inventory/overview?region=Inventory Test Region").set("Cookie", regionalAdminCookie);
    expect(after.body.variances.some((v: { id: string }) => v.id === varianceId)).toBe(false);
  });

  it("404s for an unknown reconciliation record", async () => {
    const res = await request(app)
      .post(`/inventory/reconciliations/${crypto.randomUUID()}/resolve`)
      .set("Cookie", regionalAdminCookie);
    expect(res.status).toBe(404);
  });
});
