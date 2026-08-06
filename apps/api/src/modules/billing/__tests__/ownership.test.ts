import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq, and, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { patient, wallet } from "../../patient/schema.js";
import { user, session } from "../../auth/schema.js";
import { serviceClassification, tariff } from "../schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";

const app = createApp();
const base = "/invoices";

let testFacilityId: string;
let testClassificationId: string;
let ownPatientId: string;
let ownCookie: string;
let otherCookie: string;

beforeAll(async () => {
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Invoice Ownership Fac", region: "Lagos", address: "IO St", status: "ACTIVE",
  }).returning();
  testFacilityId = facRows[0]!.id;

  const ownUserId = crypto.randomUUID();
  await db.insert(user).values({ id: ownUserId, email: `inv-own-${crypto.randomUUID()}@test.com`, passwordHash: "test" });
  const ownSessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: ownSessionId, userId: ownUserId, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  ownCookie = `${SESSION_COOKIE_NAME}=${ownSessionId}`;

  const otherUserId = crypto.randomUUID();
  await db.insert(user).values({ id: otherUserId, email: `inv-other-${crypto.randomUUID()}@test.com`, passwordHash: "test" });
  const otherSessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: otherSessionId, userId: otherUserId, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  otherCookie = `${SESSION_COOKIE_NAME}=${otherSessionId}`;

  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "INVOWN-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    userId: ownUserId,
    firstName: "InvOwn", lastName: "Test", dob: "1990-01-01", gender: "Male",
    phone: "+2348099992222", email: "invown." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: testFacilityId, status: "ACTIVE",
  }).returning();
  ownPatientId = patRows[0]!.id;

  const existing = await db.select().from(serviceClassification).where(sql`${serviceClassification.name}::text = 'CONSULTATION'`).limit(1);
  testClassificationId = existing.length > 0
    ? existing[0]!.id
    : (await db.insert(serviceClassification).values({
        id: crypto.randomUUID(), name: "CONSULTATION", cappedNetworkFeeKobo: 500000n,
      }).returning())[0]!.id;

  const existingTariff = await db.select().from(tariff)
    .where(and(eq(tariff.facilityId, testFacilityId), eq(tariff.classificationId, testClassificationId)))
    .limit(1);
  if (existingTariff.length === 0) {
    await db.insert(tariff).values({
      id: crypto.randomUUID(), facilityId: testFacilityId, classificationId: testClassificationId,
      networkFeeKobo: 100000n, facilityBedFeeKobo: 60000n, drugPriceKobo: 40000n,
    });
  }

  await db.insert(wallet).values({ id: crypto.randomUUID(), patientId: ownPatientId, balanceKobo: 10000000n });
});

async function createOwnInvoice() {
  // Invoice creation stays staff-permission-gated (SUPER_ADMIN via the global test bypass) —
  // only read/pay are being tested for ownership here.
  const created = await request(app).post(base).send({
    patientId: ownPatientId, facilityId: testFacilityId, classificationId: testClassificationId,
  });
  await request(app).post(`${base}/${created.body.invoiceId}/send`);
  return created.body.invoiceId as string;
}

describe("GET /invoices/:id — ownership", () => {
  it("lets the linked patient read their own invoice", async () => {
    const invoiceId = await createOwnInvoice();
    const res = await request(app).get(`${base}/${invoiceId}`).set("Cookie", ownCookie);
    expect(res.status).toBe(200);
  });

  it("rejects a different authenticated user with no invoice:read permission", async () => {
    const invoiceId = await createOwnInvoice();
    const res = await request(app).get(`${base}/${invoiceId}`).set("Cookie", otherCookie);
    expect(res.status).toBe(403);
  });
});

describe("POST /invoices/:id/pay — Patient role spec: 'can pay own invoices from wallet'", () => {
  it("lets the linked patient pay their own invoice", async () => {
    const invoiceId = await createOwnInvoice();
    const res = await request(app).post(`${base}/${invoiceId}/pay`).set("Cookie", ownCookie);
    expect(res.status).toBe(200);
    expect(res.body.invoice.status).toBe("PAID");
  });

  it("rejects a different authenticated user paying someone else's invoice", async () => {
    const invoiceId = await createOwnInvoice();
    const res = await request(app).post(`${base}/${invoiceId}/pay`).set("Cookie", otherCookie);
    expect(res.status).toBe(403);
  });
});

describe("GET /classifications — reference data, any authenticated user", () => {
  it("is readable by a plain patient account with no serviceClassification:read grant", async () => {
    const res = await request(app).get("/classifications").set("Cookie", ownCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.classifications)).toBe(true);
  });
});

describe("GET /wallet/transactions — ownership", () => {
  it("lets the linked patient read their own wallet transaction history", async () => {
    const invoiceId = await createOwnInvoice();
    await request(app).post(`${base}/${invoiceId}/pay`).set("Cookie", ownCookie);

    const res = await request(app).get(`/wallet/transactions?patientId=${ownPatientId}`).set("Cookie", ownCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.transactions)).toBe(true);
    expect(res.body.transactions.some((t: { type: string }) => t.type === "DEBIT")).toBe(true);
  });

  it("rejects a different authenticated user with no wallet:read permission", async () => {
    const res = await request(app).get(`/wallet/transactions?patientId=${ownPatientId}`).set("Cookie", otherCookie);
    expect(res.status).toBe(403);
  });
});
