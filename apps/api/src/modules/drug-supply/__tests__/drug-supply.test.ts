import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { user, session, role, userRole } from "../../auth/schema.js";
import { patient } from "../../patient/schema.js";
import { regimen, regimenCycle } from "../../clinical-metrics/schema.js";
import { nursingCase } from "../../nursing/schema.js";
import { drug } from "../../inventory/schema.js";
import { regionalDrugStockLedgerEntry } from "../schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { seedIdentity } from "../../../seed/identity.js";

const app = createApp();
const REGION = `DrugSupply Region ${crypto.randomUUID().slice(0, 8)}`;

let facilityId: string;
let drugId: string;
let officer: { id: string; cookie: string };
let otherOfficer: { id: string; cookie: string };
let admin: { id: string; cookie: string };
let outsideAdmin: { id: string; cookie: string };

// Creates a user with the given role and facility, returning a valid session cookie.
async function createUser(roleName: string, facility_: string): Promise<{ id: string; cookie: string }> {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, email: `drug-${crypto.randomUUID()}@test.com`, passwordHash: "test", facilityId: facility_ });
  const roleRow = await db.select().from(role).where(eq(role.name, roleName as never)).limit(1);
  await db.insert(userRole).values({ userId: id, roleId: roleRow[0]!.id });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId: id, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  return { id, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

// Creates a facility in the given region and returns its id.
async function createFacility(region: string): Promise<string> {
  const rows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: `Drug Supply Facility ${crypto.randomUUID().slice(0, 6)}`, region, address: "DS St", status: "ACTIVE",
  }).returning();
  return rows[0]!.id;
}

// Adds procurement stock for the test drug to the regional ledger.
async function procure(quantity: number) {
  await db.insert(regionalDrugStockLedgerEntry).values({ drugId, quantityDelta: quantity, reason: "PROCUREMENT" });
}

// Reads a regional stock figure for the test drug through the API.
async function regionalStock(): Promise<number> {
  const res = await request(app).get("/drug-stock/regional").set("Cookie", admin.cookie);
  return res.body.stock.find((s: { drugId: string }) => s.drugId === drugId).quantity;
}

// Reads an officer's stock of the test drug through the API (0 when they have no ledger entries).
async function officerStock(who: { cookie: string }): Promise<number> {
  const res = await request(app).get("/drug-stock/mine").set("Cookie", who.cookie);
  return res.body.stock.find((s: { drugId: string }) => s.drugId === drugId)?.quantity ?? 0;
}

// Creates a request from the officer and returns its id.
async function requestDrugs(quantity: number): Promise<string> {
  const res = await request(app).post("/drug-requests").set("Cookie", officer.cookie).send({ lines: [{ drugId, quantity }] });
  expect(res.status).toBe(201);
  return res.body.id;
}

// Requests, dispatches and acknowledges a delivery so the officer holds the given stock.
async function stockOfficer(quantity: number) {
  await procure(quantity);
  const requestId = await requestDrugs(quantity);
  const dispatch = await request(app).post(`/drug-requests/${requestId}/dispatch`).set("Cookie", admin.cookie).send({ lines: [{ drugId, quantity }] });
  expect(dispatch.status).toBe(201);
  const ack = await request(app).post(`/drug-dispatches/${dispatch.body.id}/acknowledge`).set("Cookie", officer.cookie);
  expect(ack.status).toBe(204);
}

// Creates a nursing case started by the given user, in the given status.
async function createCase(startedBy: string, status: "STARTED" | "CLOSED" = "STARTED"): Promise<string> {
  const patientId = crypto.randomUUID();
  await db.insert(patient).values({
    id: patientId, uniquePatientId: "DS-" + crypto.randomUUID().slice(0, 8).toUpperCase(), firstName: "Drug", lastName: "Supply",
    dob: "1990-01-01", gender: "Male", phone: "+2348012340000", email: `ds.${crypto.randomUUID().slice(0, 6)}@example.com`,
    facilityId, status: "ACTIVE",
  });
  const regimenId = crypto.randomUUID();
  await db.insert(regimen).values({
    id: regimenId, patientId, drugName: "Test", protocolCode: "T-1", totalCycles: 4, cycleIntervalDays: 21, startedAt: new Date(),
  });
  const cycleId = crypto.randomUUID();
  await db.insert(regimenCycle).values({ id: cycleId, regimenId, cycleNumber: 1, scheduledDate: new Date().toISOString().slice(0, 10) });
  const caseId = crypto.randomUUID();
  await db.insert(nursingCase).values({ id: caseId, patientId, regimenCycleId: cycleId, startedBy, status });
  return caseId;
}

beforeAll(async () => {
  await seedIdentity();
  facilityId = await createFacility(REGION);
  drugId = crypto.randomUUID();
  await db.insert(drug).values({ id: drugId, name: `Test Drug ${drugId.slice(0, 6)}`, strength: "1mg", category: "Test", reorderThreshold: 5 });
  officer = await createUser("ONSITE_NURSING_OFFICER", facilityId);
  otherOfficer = await createUser("ONSITE_NURSING_OFFICER", facilityId);
  admin = await createUser("REGIONAL_ADMIN", facilityId);
  outsideAdmin = await createUser("REGIONAL_ADMIN", await createFacility(`${REGION} Elsewhere`));
});

afterAll(async () => {
  // Hides the test drug from real listings; the ledger rows that reference it stay, as append-only history.
  await db.update(drug).set({ isDeleted: true, deletedAt: new Date() }).where(eq(drug.id, drugId));
});

describe("request → dispatch → acknowledge", () => {
  it("rejects a request with the same drug on two lines", async () => {
    const res = await request(app).post("/drug-requests").set("Cookie", officer.cookie).send({
      lines: [{ drugId, quantity: 1 }, { drugId, quantity: 2 }],
    });
    expect(res.status).toBe(400);
  });

  it("keeps requesting and dispatching to the right roles", async () => {
    const requestId = await requestDrugs(3);
    const officerDispatch = await request(app).post(`/drug-requests/${requestId}/dispatch`).set("Cookie", officer.cookie).send({ lines: [{ drugId, quantity: 1 }] });
    expect(officerDispatch.status).toBe(403);
    const adminRequest = await request(app).post("/drug-requests").set("Cookie", admin.cookie).send({ lines: [{ drugId, quantity: 1 }] });
    expect(adminRequest.status).toBe(403);
  });

  it("refuses to dispatch a request from outside the admin's region", async () => {
    const requestId = await requestDrugs(2);
    const res = await request(app).post(`/drug-requests/${requestId}/dispatch`).set("Cookie", outsideAdmin.cookie).send({ lines: [{ drugId, quantity: 1 }] });
    expect(res.status).toBe(403);
  });

  it("rejects dispatching more than was requested", async () => {
    await procure(50);
    const requestId = await requestDrugs(4);
    const res = await request(app).post(`/drug-requests/${requestId}/dispatch`).set("Cookie", admin.cookie).send({ lines: [{ drugId, quantity: 5 }] });
    expect(res.status).toBe(400);
  });

  it("refuses to dispatch more than regional stock and reports what is available", async () => {
    const before = await regionalStock();
    const requestId = await requestDrugs(before + 10);
    const res = await request(app).post(`/drug-requests/${requestId}/dispatch`).set("Cookie", admin.cookie).send({ lines: [{ drugId, quantity: before + 1 }] });
    expect(res.status).toBe(409);
    expect(res.body.details.available).toBe(before);
    expect(await regionalStock()).toBe(before);
  });

  it("supports partial fulfilment, debiting regional stock and crediting the officer only on acknowledgment", async () => {
    await procure(20);
    const regionalBefore = await regionalStock();
    const officerBefore = await officerStock(officer);
    const requestId = await requestDrugs(10);
    const dispatch = await request(app).post(`/drug-requests/${requestId}/dispatch`).set("Cookie", admin.cookie).send({ lines: [{ drugId, quantity: 6 }] });
    expect(dispatch.status).toBe(201);

    expect(await regionalStock()).toBe(regionalBefore - 6);
    expect(await officerStock(officer)).toBe(officerBefore);

    const inTransit = await request(app).get("/drug-requests/mine").set("Cookie", officer.cookie);
    const mine = inTransit.body.requests.find((r: { id: string }) => r.id === requestId);
    expect(mine.status).toBe("DISPATCHED");
    expect(mine.dispatch.status).toBe("IN_TRANSIT");
    expect(mine.dispatch.lines[0].quantityDispatched).toBe(6);

    const stranger = await request(app).post(`/drug-dispatches/${dispatch.body.id}/acknowledge`).set("Cookie", otherOfficer.cookie);
    expect(stranger.status).toBe(403);
    const adminAck = await request(app).post(`/drug-dispatches/${dispatch.body.id}/acknowledge`).set("Cookie", admin.cookie);
    expect(adminAck.status).toBe(403);

    const ack = await request(app).post(`/drug-dispatches/${dispatch.body.id}/acknowledge`).set("Cookie", officer.cookie);
    expect(ack.status).toBe(204);
    expect(await officerStock(officer)).toBe(officerBefore + 6);

    const adminView = await request(app).get("/drug-requests").set("Cookie", admin.cookie);
    const seen = adminView.body.requests.find((r: { id: string }) => r.id === requestId);
    expect(seen.status).toBe("DELIVERED");
    expect(seen.dispatch.status).toBe("DELIVERED");
  });

  it("credits stock once when the same dispatch is acknowledged twice at the same time", async () => {
    await procure(10);
    const requestId = await requestDrugs(5);
    const dispatch = await request(app).post(`/drug-requests/${requestId}/dispatch`).set("Cookie", admin.cookie).send({ lines: [{ drugId, quantity: 5 }] });
    const before = await officerStock(officer);
    const [a, b] = await Promise.all([
      request(app).post(`/drug-dispatches/${dispatch.body.id}/acknowledge`).set("Cookie", officer.cookie),
      request(app).post(`/drug-dispatches/${dispatch.body.id}/acknowledge`).set("Cookie", officer.cookie),
    ]);
    expect([a.status, b.status].sort()).toEqual([204, 409]);
    expect(await officerStock(officer)).toBe(before + 5);
  });

  it("lets only one of two concurrent dispatches spend the same regional stock", async () => {
    const start = await regionalStock();
    // Leaves exactly 8 in regional stock, then two requests of 8 race for it.
    if (start > 8) {
      await db.insert(regionalDrugStockLedgerEntry).values({ drugId, quantityDelta: 8 - start, reason: "ADJUSTMENT" });
    } else {
      await procure(8 - start);
    }
    const first = await requestDrugs(8);
    const second = await requestDrugs(8);
    const results = await Promise.all([first, second].map((id) =>
      request(app).post(`/drug-requests/${id}/dispatch`).set("Cookie", admin.cookie).send({ lines: [{ drugId, quantity: 8 }] })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await regionalStock()).toBe(0);
  });

  it("lets an officer cancel their own request only while it is undispatched", async () => {
    const requestId = await requestDrugs(1);
    const other = await request(app).post(`/drug-requests/${requestId}/cancel`).set("Cookie", otherOfficer.cookie);
    expect(other.status).toBe(403);
    const cancelled = await request(app).post(`/drug-requests/${requestId}/cancel`).set("Cookie", officer.cookie);
    expect(cancelled.status).toBe(204);
    const again = await request(app).post(`/drug-requests/${requestId}/cancel`).set("Cookie", officer.cookie);
    expect(again.status).toBe(409);
    await procure(5);
    const dispatch = await request(app).post(`/drug-requests/${requestId}/dispatch`).set("Cookie", admin.cookie).send({ lines: [{ drugId, quantity: 1 }] });
    expect(dispatch.status).toBe(409);
  });
});

describe("usage and loss", () => {
  it("deducts usage immediately, only against the officer's own open case", async () => {
    await stockOfficer(10);
    const before = await officerStock(officer);
    const caseId = await createCase(officer.id);

    const used = await request(app).post("/drug-usage").set("Cookie", officer.cookie).send({ nursingCaseId: caseId, drugId, quantity: 3 });
    expect(used.status).toBe(201);
    expect(await officerStock(officer)).toBe(before - 3);

    const listed = await request(app).get(`/drug-usage?nursingCaseId=${caseId}`).set("Cookie", officer.cookie);
    expect(listed.body.usage.map((u: { quantityUsed: number }) => u.quantityUsed)).toEqual([3]);

    const foreign = await request(app).post("/drug-usage").set("Cookie", otherOfficer.cookie).send({ nursingCaseId: caseId, drugId, quantity: 1 });
    expect(foreign.status).toBe(403);
    const closedId = await createCase(officer.id, "CLOSED");
    const closed = await request(app).post("/drug-usage").set("Cookie", officer.cookie).send({ nursingCaseId: closedId, drugId, quantity: 1 });
    expect(closed.status).toBe(409);
  });

  it("records a loss without a case, requires a description for OTHER, and alerts Regional Admin", async () => {
    await stockOfficer(4);
    const before = await officerStock(officer);
    const vague = await request(app).post("/drug-loss-reports").set("Cookie", officer.cookie).send({ drugId, quantity: 1, reason: "OTHER" });
    expect(vague.status).toBe(400);

    const lost = await request(app).post("/drug-loss-reports").set("Cookie", officer.cookie).send({ drugId, quantity: 2, reason: "SPILLAGE" });
    expect(lost.status).toBe(201);
    expect(await officerStock(officer)).toBe(before - 2);

    const alerts = await request(app).get("/drug-alerts").set("Cookie", admin.cookie);
    expect(alerts.body.losses.some((l: { id: string }) => l.id === lost.body.id)).toBe(true);
    const outside = await request(app).get("/drug-alerts").set("Cookie", outsideAdmin.cookie);
    expect(outside.body.losses.some((l: { id: string }) => l.id === lost.body.id)).toBe(false);
  });
});

describe("stock views and alerts", () => {
  it("shows an officer's stock as of a past day without later movements", async () => {
    const today = await request(app).get("/drug-stock/officers").set("Cookie", admin.cookie);
    expect(today.body.stock.some((s: { officerId: string }) => s.officerId === officer.id)).toBe(true);
    const past = await request(app).get("/drug-stock/officers?asOf=2020-01-01").set("Cookie", admin.cookie);
    expect(past.body.stock.some((s: { officerId: string }) => s.officerId === officer.id)).toBe(false);
    const outside = await request(app).get("/drug-stock/officers").set("Cookie", outsideAdmin.cookie);
    expect(outside.body.stock.some((s: { officerId: string }) => s.officerId === officer.id)).toBe(false);
  });

  it("keeps the officer-facing and admin-facing stock views to the right roles", async () => {
    expect((await request(app).get("/drug-stock/regional").set("Cookie", officer.cookie)).status).toBe(403);
    expect((await request(app).get("/drug-stock/mine").set("Cookie", officer.cookie)).status).toBe(200);
  });

  it("raises a low-stock alert once stock is at or below the drug's threshold", async () => {
    const before = await regionalStock();
    if (before > 5) await db.insert(regionalDrugStockLedgerEntry).values({ drugId, quantityDelta: 5 - before, reason: "ADJUSTMENT" });
    const alerts = await request(app).get("/drug-alerts").set("Cookie", admin.cookie);
    expect(alerts.body.lowStock.some((l: { scope: string; drugId: string }) => l.scope === "REGIONAL" && l.drugId === drugId)).toBe(true);
  });
});

describe("reconciliation", () => {
  const today = new Date().toISOString().slice(0, 10);

  it("snapshots the expected quantity, flags a variance as an alert, and clears it on resolve", async () => {
    const expected = await officerStock(officer);
    const counted = await request(app).post("/drug-reconciliations").set("Cookie", admin.cookie).send({
      scope: "NURSING_OFFICER", nursingOfficerId: officer.id, drugId, periodStart: today, periodEnd: today, countedQuantity: expected - 2,
    });
    expect(counted.status).toBe(201);
    expect(counted.body).toMatchObject({ expectedQuantity: expected, variance: -2 });

    const alerts = await request(app).get("/drug-alerts").set("Cookie", admin.cookie);
    const flagged = alerts.body.variances.find((v: { id: string }) => v.id === counted.body.id);
    expect(flagged).toBeDefined();

    const resolved = await request(app).post(`/drug-reconciliations/${counted.body.id}/resolve`).set("Cookie", admin.cookie);
    expect(resolved.status).toBe(200);
    const after = await request(app).get("/drug-alerts").set("Cookie", admin.cookie);
    expect(after.body.variances.some((v: { id: string }) => v.id === counted.body.id)).toBe(false);
  });

  it("does not flag a count that matches the ledger", async () => {
    const expected = await officerStock(officer);
    const counted = await request(app).post("/drug-reconciliations").set("Cookie", admin.cookie).send({
      scope: "NURSING_OFFICER", nursingOfficerId: officer.id, drugId, periodStart: today, periodEnd: today, countedQuantity: expected,
    });
    expect(counted.body.variance).toBe(0);
    const alerts = await request(app).get("/drug-alerts").set("Cookie", admin.cookie);
    expect(alerts.body.variances.some((v: { id: string }) => v.id === counted.body.id)).toBe(false);
  });

  it("lets an officer count only their own stock", async () => {
    const own = await request(app).post("/drug-reconciliations").set("Cookie", officer.cookie).send({
      scope: "NURSING_OFFICER", drugId, periodStart: today, periodEnd: today, countedQuantity: 0,
    });
    expect(own.status).toBe(201);
    const someoneElse = await request(app).post("/drug-reconciliations").set("Cookie", officer.cookie).send({
      scope: "NURSING_OFFICER", nursingOfficerId: otherOfficer.id, drugId, periodStart: today, periodEnd: today, countedQuantity: 0,
    });
    expect(someoneElse.status).toBe(403);
    const regional = await request(app).post("/drug-reconciliations").set("Cookie", officer.cookie).send({
      scope: "REGIONAL", drugId, periodStart: today, periodEnd: today, countedQuantity: 0,
    });
    expect(regional.status).toBe(403);
  });

  it("computes a regional count against the regional ledger", async () => {
    const expected = await regionalStock();
    const counted = await request(app).post("/drug-reconciliations").set("Cookie", admin.cookie).send({
      scope: "REGIONAL", drugId, periodStart: today, periodEnd: today, countedQuantity: expected + 1,
    });
    expect(counted.body).toMatchObject({ expectedQuantity: expected, variance: 1 });
  });
});
