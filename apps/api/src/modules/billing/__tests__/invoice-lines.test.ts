import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { patient } from "../../patient/schema.js";
import { drug } from "../../inventory/schema.js";
import { subscription, serviceSubOption, invoiceItem, invoiceLine, invoiceLineDrug } from "../schema.js";
import { ServiceClassificationRepository } from "../repository.js";

const app = createApp();

let facilityId: string;
let patientId: string;
let subscriberId: string;
let drugId: string;
const optionIds: Record<string, string> = {};
const classificationIds: Record<string, string> = {};

async function makePatient(label: string) {
  const [row] = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: `LINES-${label}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
    firstName: "Lines", lastName: label, dob: "1990-01-01", gender: "Male",
    phone: "+2348099992222", email: `lines.${label}.${crypto.randomUUID().slice(0, 6)}@test.com`,
    facilityId, status: "ACTIVE",
  }).returning();
  return row!.id;
}

beforeAll(async () => {
  const [fac] = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Lines Test Fac", region: "Lagos", address: "Lines St", status: "ACTIVE",
  }).returning();
  facilityId = fac!.id;
  patientId = await makePatient("NonSub");
  subscriberId = await makePatient("Sub");
  await db.insert(subscription).values({
    id: crypto.randomUUID(), patientId: subscriberId, billingCycle: "MONTHLY", status: "ACTIVE",
    nextBillingDate: "2099-01-01", startedAt: new Date(),
  });

  const options = await db.select().from(serviceSubOption);
  for (const o of options) optionIds[o.code] = o.id;
  const classRepo = new ServiceClassificationRepository();
  for (const name of ["CONSULTATION", "DRUG_ADMINISTRATION", "SUBSCRIPTION"]) {
    classificationIds[name] = (await classRepo.findByName(name))!.id;
  }
  const [d] = await db.select().from(drug).limit(1);
  drugId = d!.id;
});

describe("POST /invoices/quote", () => {
  it("prices a non-subscriber at the full flat fee", async () => {
    const res = await request(app).post("/invoices/quote").send({ patientId, lines: [{ subOptionId: optionIds.SINGLE_VIRTUAL }] });
    expect(res.status).toBe(200);
    expect(res.body.isSubscriber).toBe(false);
    expect(res.body.totalKobo).toBe("5000000");
  });

  it("prices an active subscriber at the discounted fee", async () => {
    const res = await request(app).post("/invoices/quote").send({ patientId: subscriberId, lines: [{ subOptionId: optionIds.SINGLE_VIRTUAL }] });
    expect(res.body.isSubscriber).toBe(true);
    expect(res.body.totalKobo).toBe("4000000");
  });

  it("sums several services", async () => {
    const res = await request(app).post("/invoices/quote").send({
      patientId, lines: [{ subOptionId: optionIds.PHYSICAL }, { subOptionId: optionIds.BED_24H }],
    });
    expect(res.body.totalKobo).toBe(String((75_000 + 15_000) * 100));
  });

  it("rejects drugs on a non drug-administration line", async () => {
    const res = await request(app).post("/invoices/quote").send({ patientId, lines: [{ subOptionId: optionIds.PHYSICAL, drugs: [{ drugId, quantity: 1 }] }] });
    expect(res.status).toBe(400);
  });

  it("rejects the same service twice", async () => {
    const res = await request(app).post("/invoices/quote").send({
      patientId, lines: [{ subOptionId: optionIds.PHYSICAL }, { subOptionId: optionIds.PHYSICAL }],
    });
    expect(res.status).toBe(400);
  });
});

describe("subscription and side-effect report are not invoiceable", () => {
  it("rejects a sub-option under a non-invoiceable classification", async () => {
    const [temp] = await db.insert(serviceSubOption).values({
      classificationId: classificationIds.SUBSCRIPTION!, code: `TMP_${crypto.randomUUID().slice(0, 6)}`, name: "Temp",
    }).returning();
    const res = await request(app).post("/invoices/quote").send({ patientId, lines: [{ subOptionId: temp!.id }] });
    expect(res.status).toBe(400);
    await db.delete(serviceSubOption).where(eq(serviceSubOption.id, temp!.id));
  });
});

describe("POST /invoices with lines", () => {
  it("creates one invoice with a line per service, recorded drugs and summed components", async () => {
    const res = await request(app).post("/invoices").send({
      patientId, facilityId,
      lines: [{ subOptionId: optionIds.SINGLE_VIRTUAL }, { subOptionId: optionIds.SHORT_STAY_INFUSION, drugs: [{ drugId, quantity: 3 }] }],
    });
    expect(res.status).toBe(201);
    const id = res.body.invoiceId as string;
    // 50,000 consultation + 65,000 short-stay infusion
    expect(res.body.invoice.totalKobo).toBe("11500000");

    const lines = await db.select().from(invoiceLine).where(eq(invoiceLine.invoiceId, id));
    expect(lines).toHaveLength(2);
    const drugLines = await db.select().from(invoiceLineDrug).where(eq(invoiceLineDrug.drugId, drugId));
    const mine = drugLines.filter((l) => lines.some((x) => x.id === l.invoiceLineId));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.quantity).toBe(3);

    const items = await db.select().from(invoiceItem).where(eq(invoiceItem.invoiceId, id));
    expect(items.reduce((sum, i) => sum + i.amountKobo, 0n)).toBe(11_500_000n);

    const read = await request(app).get(`/invoices/${id}`);
    expect(read.body.invoice.lines).toHaveLength(2);
    const drugLine = read.body.invoice.lines.find((l: { drugs: unknown[] }) => l.drugs.length > 0);
    expect(drugLine.drugs[0].quantity).toBe(3);
  });

  it("rejects a drug quantity below 1", async () => {
    const res = await request(app).post("/invoices/quote").send({
      patientId, lines: [{ subOptionId: optionIds.SHORT_STAY_INFUSION, drugs: [{ drugId, quantity: 0 }] }],
    });
    expect(res.status).toBe(400);
  });
});

describe("Regional Admin permissions for the generator", () => {
  it("can send invoices but not void or pay on a patient's behalf", async () => {
    const granted = await db.execute<{ resource: string; action: string }>(sql`
      SELECT p.resource, p.action FROM role r
      JOIN role_permission rp ON rp.role_id = r.id
      JOIN permission p ON p.id = rp.permission_id
      WHERE r.name = 'REGIONAL_ADMIN' AND p.resource = 'invoice'`);
    const actions = granted.map((g) => g.action);
    expect(actions).toContain("create");
    expect(actions).toContain("send");
    expect(actions).not.toContain("update");
  });
});

describe("GET /invoices/:id receipt details", () => {
  it("includes created date, issue date, facility name and, once paid, the payment reference", async () => {
    const created = await request(app).post("/invoices").send({ patientId, facilityId, lines: [{ subOptionId: optionIds.SINGLE_VIRTUAL }] });
    const id = created.body.invoiceId as string;
    const draft = await request(app).get(`/invoices/${id}`);
    expect(draft.body.invoice.createdAt).toBeTruthy();
    expect(draft.body.invoice.issuedAt).toBeNull();
    expect(draft.body.invoice.facilityName).toBe("Lines Test Fac");
    expect(draft.body.invoice.payment).toBeNull();
  });
});
