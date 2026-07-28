import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../../../app";
import { db } from "../../../db";
import { eq, and, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { facility } from "../../facility/schema";
import { patient, wallet } from "../../patient/schema";
import { serviceClassification, tariff, invoice, invoiceItem } from "../schema";

const app = createApp();
const base = "/invoices";

let testPatientId: string;
let testFacilityId: string;
let testClassificationId: string;

beforeAll(async () => {
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Invoice Test Fac", region: "Lagos", address: "Inv St", status: "ACTIVE",
  }).returning();
  testFacilityId = facRows[0]!.id;

  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "INV-TEST-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    firstName: "Invoice", lastName: "Test", dob: "1990-01-01", gender: "Male",
    phone: "+2348099991111", email: "inv-test." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: testFacilityId, status: "ACTIVE",
  }).returning();
  testPatientId = patRows[0]!.id;

  const existing = await db.select().from(serviceClassification).where(sql`${serviceClassification.name}::text = 'CONSULTATION'`).limit(1);
  if (existing.length > 0) {
    testClassificationId = existing[0]!.id;
  } else {
    const classRows = await db.insert(serviceClassification).values({
      id: crypto.randomUUID(), name: "CONSULTATION", cappedNetworkFeeKobo: 500000n,
    }).returning();
    testClassificationId = classRows[0]!.id;
  }

  const existingTariff = await db.select().from(tariff)
    .where(and(eq(tariff.facilityId, testFacilityId), eq(tariff.classificationId, testClassificationId)))
    .limit(1);
  if (existingTariff.length === 0) {
    await db.insert(tariff).values({
      id: crypto.randomUUID(), facilityId: testFacilityId, classificationId: testClassificationId,
      networkFeeKobo: 100000n, facilityBedFeeKobo: 60000n, drugPriceKobo: 40000n,
    });
  }

  const walletExists = await db.select().from(wallet).where(eq(wallet.patientId, testPatientId)).limit(1);
  if (walletExists.length === 0) {
    await db.insert(wallet).values({
      id: crypto.randomUUID(), patientId: testPatientId, balanceKobo: 10000000n,
    });
  }
});

describe("Invoice entity — state machine", () => {
  it("transitions DRAFT → SENT → PAID", async () => {
    const { Invoice } = await import("../entities/Invoice");
    const inv = new Invoice({
      id: crypto.randomUUID(), patientId: testPatientId, facilityId: testFacilityId,
      classificationId: testClassificationId, status: "DRAFT", totalKobo: 200000n, appointmentId: null, issuedAt: null,
    });
    const sent = inv.transition("SENT");
    expect(sent.status).toBe("SENT");
    const paid = sent.transition("PAID");
    expect(paid.status).toBe("PAID");
  });

  it("rejects invalid transition DRAFT → PAID", async () => {
    const { Invoice } = await import("../entities/Invoice");
    const inv = new Invoice({
      id: crypto.randomUUID(), patientId: testPatientId, facilityId: testFacilityId,
      classificationId: testClassificationId, status: "DRAFT", totalKobo: 200000n, appointmentId: null, issuedAt: null,
    });
    expect(() => inv.transition("PAID")).toThrow("Cannot transition invoice from DRAFT to PAID");
  });
});

describe("POST /invoices — create", () => {
  it("creates invoice from tariff (FR-51: no manual amount)", async () => {
    const res = await request(app).post(base).send({
      patientId: testPatientId, facilityId: testFacilityId, classificationId: testClassificationId,
    });
    expect(res.status).toBe(201);
    expect(res.body.invoice).toBeDefined();
    expect(res.body.invoice.totalKobo).toBe("200000");
    expect(res.body.invoice.status).toBe("DRAFT");
  });

  it("returns 400 for missing tariff", async () => {
    const res = await request(app).post(base).send({
      patientId: testPatientId, facilityId: testFacilityId,
      classificationId: crypto.randomUUID(),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No tariff found for this facility and classification combination");
  });
});

describe("Invoice lifecycle via API", () => {
  it("sends then pays an invoice", async () => {
    const created = await request(app).post(base).send({
      patientId: testPatientId, facilityId: testFacilityId, classificationId: testClassificationId,
    });
    const invoiceId = created.body.invoiceId;

    const sent = await request(app).post(`${base}/${invoiceId}/send`);
    expect(sent.status).toBe(200);
    expect(sent.body.invoice.status).toBe("SENT");

    const paid = await request(app).post(`${base}/${invoiceId}/pay`);
    expect(paid.status).toBe(200);
    expect(paid.body.invoice.status).toBe("PAID");
  });

  it("voids a DRAFT invoice", async () => {
    const created = await request(app).post(base).send({
      patientId: testPatientId, facilityId: testFacilityId, classificationId: testClassificationId,
    });
    const res = await request(app).post(`${base}/${created.body.invoiceId}/void`);
    expect(res.status).toBe(200);
    expect(res.body.invoice.status).toBe("VOID");
  });
});

describe("InvoiceItem — append-only guard", () => {
  it("rejects adding items to non-DRAFT invoice", async () => {
    const created = await request(app).post(base).send({
      patientId: testPatientId, facilityId: testFacilityId, classificationId: testClassificationId,
    });
    const invoiceId = created.body.invoiceId;

    await request(app).post(`${base}/${invoiceId}/send`);

    const { InvoiceService } = await import("../service");
    const svc = new InvoiceService();
    await expect(
      svc.addItem(invoiceId, "NETWORK_FEE", 10000n),
    ).rejects.toThrow("Cannot add items to a non-DRAFT invoice");
  });
});
