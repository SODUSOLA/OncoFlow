import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq, and, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { patient, wallet } from "../../patient/schema.js";
import { user, session } from "../../auth/schema.js";
import { serviceClassification, tariff, subscription, invoice } from "../schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { SUBSCRIPTION_FEE_KOBO, nextBillingDate, lagosToday, addDays } from "../entities/subscription-pricing.js";

const app = createApp();

let facilityId: string;
let consultationId: string;

interface Account { patientId: string; walletId: string; cookie: string }

// Builds a linked patient with a session cookie and a wallet holding `balanceKobo`.
async function makeAccount(balanceKobo: bigint): Promise<Account> {
  const userId = crypto.randomUUID();
  await db.insert(user).values({ id: userId, email: `autod-${crypto.randomUUID()}@test.com`, passwordHash: "test" });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId, device: "test", ip: "127.0.0.1", expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  const patientId = (await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "AUTOD-" + crypto.randomUUID().slice(0, 8).toUpperCase(), userId,
    firstName: "Auto", lastName: "Deduct", dob: "1990-01-01", gender: "Male", phone: "+2348099993333",
    email: `autod.${crypto.randomUUID().slice(0, 6)}@test.com`, facilityId, status: "ACTIVE",
  }).returning())[0]!.id;
  const walletId = (await db.insert(wallet).values({ id: crypto.randomUUID(), patientId, balanceKobo }).returning())[0]!.id;
  return { patientId, walletId, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

// Creates and sends a consultation invoice through the staff route (test bypass) and returns its id and final status.
async function issueInvoice(patientId: string) {
  const created = await request(app).post("/invoices").send({ patientId, facilityId, classificationId: consultationId });
  const sent = await request(app).post(`/invoices/${created.body.invoiceId}/send`);
  return { invoiceId: created.body.invoiceId as string, status: sent.body.invoice.status as string };
}

beforeAll(async () => {
  facilityId = (await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Auto Deduct Fac", region: "Lagos", address: "AD St", status: "ACTIVE",
  }).returning())[0]!.id;

  const existing = await db.select().from(serviceClassification).where(sql`${serviceClassification.name}::text = 'CONSULTATION'`).limit(1);
  consultationId = existing[0]?.id ?? (await db.insert(serviceClassification).values({
    id: crypto.randomUUID(), name: "CONSULTATION", cappedNetworkFeeKobo: 500000n,
  }).returning())[0]!.id;
  const tariffRow = await db.select().from(tariff).where(and(eq(tariff.facilityId, facilityId), eq(tariff.classificationId, consultationId))).limit(1);
  if (tariffRow.length === 0) {
    await db.insert(tariff).values({
      id: crypto.randomUUID(), facilityId, classificationId: consultationId,
      networkFeeKobo: 100000n, facilityBedFeeKobo: 60000n, drugPriceKobo: 40000n,
    });
  }
  const sub = await db.select().from(serviceClassification).where(sql`${serviceClassification.name}::text = 'SUBSCRIPTION'`).limit(1);
  if (sub.length === 0) {
    await db.insert(serviceClassification).values({ id: crypto.randomUUID(), name: "SUBSCRIPTION", cappedNetworkFeeKobo: 0n });
  }
});

describe("PUT /wallet/auto-deduct", () => {
  it("defaults off and lets the patient turn it on and off", async () => {
    const acct = await makeAccount(0n);
    const on = await request(app).put("/wallet/auto-deduct").set("Cookie", acct.cookie).send({ enabled: true });
    expect(on.status).toBe(200);
    expect(on.body.wallet.autoDeductEnabled).toBe(true);
    const off = await request(app).put("/wallet/auto-deduct").set("Cookie", acct.cookie).send({ enabled: false });
    expect(off.body.wallet.autoDeductEnabled).toBe(false);
  });

  it("rejects a non-boolean value", async () => {
    const acct = await makeAccount(0n);
    const res = await request(app).put("/wallet/auto-deduct").set("Cookie", acct.cookie).send({ enabled: "yes" });
    expect(res.status).toBe(400);
  });
});

describe("automatic deduction on invoice send", () => {
  it("leaves the invoice SENT when the setting is off", async () => {
    const acct = await makeAccount(10_000_000n);
    const { status } = await issueInvoice(acct.patientId);
    expect(status).toBe("SENT");
  });

  it("pays the invoice from the wallet when on and the balance covers it", async () => {
    const acct = await makeAccount(10_000_000n);
    await request(app).put("/wallet/auto-deduct").set("Cookie", acct.cookie).send({ enabled: true });
    const { invoiceId, status } = await issueInvoice(acct.patientId);
    expect(status).toBe("PAID");
    const [w] = await db.select().from(wallet).where(eq(wallet.id, acct.walletId));
    expect(w!.balanceKobo).toBeLessThan(10_000_000n);
    const [inv] = await db.select().from(invoice).where(eq(invoice.id, invoiceId));
    expect(inv!.status).toBe("PAID");
  });

  it("leaves the invoice SENT, unpaid and undebited, when on but the balance is short", async () => {
    const acct = await makeAccount(1n);
    await request(app).put("/wallet/auto-deduct").set("Cookie", acct.cookie).send({ enabled: true });
    const { status } = await issueInvoice(acct.patientId);
    expect(status).toBe("SENT");
    const [w] = await db.select().from(wallet).where(eq(wallet.id, acct.walletId));
    expect(w!.balanceKobo).toBe(1n);
  });
});

describe("subscription", () => {
  it("starts with no membership and lists both term prices", async () => {
    const acct = await makeAccount(0n);
    const res = await request(app).get("/subscription").set("Cookie", acct.cookie);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("NONE");
    expect(res.body.prices.MONTHLY).toBe(SUBSCRIPTION_FEE_KOBO.MONTHLY.toString());
  });

  it("activates a monthly membership and debits the wallet", async () => {
    const acct = await makeAccount(10_000_000n);
    const res = await request(app).post("/subscription").set("Cookie", acct.cookie).send({ billingCycle: "MONTHLY" });
    expect(res.status).toBe(201);
    expect(res.body.state).toBe("ACTIVE");
    expect(res.body.subscription.nextBillingDate).toBe(nextBillingDate(lagosToday(), "MONTHLY"));
    const [w] = await db.select().from(wallet).where(eq(wallet.id, acct.walletId));
    expect(w!.balanceKobo).toBe(10_000_000n - SUBSCRIPTION_FEE_KOBO.MONTHLY);
  });

  it("answers 402 with the unpaid invoice and creates nothing when the wallet is short", async () => {
    const acct = await makeAccount(100n);
    const res = await request(app).post("/subscription").set("Cookie", acct.cookie).send({ billingCycle: "YEARLY" });
    expect(res.status).toBe(402);
    expect(res.body.invoice.status).toBe("SENT");
    const rows = await db.select().from(subscription).where(eq(subscription.patientId, acct.patientId));
    expect(rows).toHaveLength(0);
  });

  it("refuses to charge again while the membership has plenty of time left", async () => {
    const acct = await makeAccount(20_000_000n);
    await request(app).post("/subscription").set("Cookie", acct.cookie).send({ billingCycle: "YEARLY" });
    const again = await request(app).post("/subscription").set("Cookie", acct.cookie).send({ billingCycle: "MONTHLY" });
    expect(again.status).toBe(400);
    const [w] = await db.select().from(wallet).where(eq(wallet.id, acct.walletId));
    expect(w!.balanceKobo).toBe(20_000_000n - SUBSCRIPTION_FEE_KOBO.YEARLY);
  });

  it("marks a lapsed membership EXPIRED and lets the patient renew it from today", async () => {
    const acct = await makeAccount(20_000_000n);
    await db.insert(subscription).values({
      id: crypto.randomUUID(), patientId: acct.patientId, billingCycle: "MONTHLY", status: "ACTIVE",
      nextBillingDate: addDays(lagosToday(), -3), startedAt: new Date(),
    });
    const before = await request(app).get("/subscription").set("Cookie", acct.cookie);
    expect(before.body.state).toBe("EXPIRED");
    const renewed = await request(app).post("/subscription").set("Cookie", acct.cookie).send({ billingCycle: "MONTHLY" });
    expect(renewed.status).toBe(201);
    expect(renewed.body.state).toBe("ACTIVE");
    expect(renewed.body.subscription.nextBillingDate).toBe(nextBillingDate(lagosToday(), "MONTHLY"));
    const rows = await db.select().from(subscription).where(eq(subscription.patientId, acct.patientId));
    expect(rows).toHaveLength(1);
  });

  it("extends from the current end date when renewing early", async () => {
    const acct = await makeAccount(20_000_000n);
    const endsOn = addDays(lagosToday(), 5);
    await db.insert(subscription).values({
      id: crypto.randomUUID(), patientId: acct.patientId, billingCycle: "MONTHLY", status: "ACTIVE",
      nextBillingDate: endsOn, startedAt: new Date(),
    });
    const res = await request(app).post("/subscription").set("Cookie", acct.cookie).send({ billingCycle: "MONTHLY" });
    expect(res.status).toBe(201);
    expect(res.body.subscription.nextBillingDate).toBe(nextBillingDate(endsOn, "MONTHLY"));
  });
});

describe("nextBillingDate", () => {
  it("clamps to month end", () => {
    expect(nextBillingDate("2026-01-31", "MONTHLY")).toBe("2026-02-28");
    expect(nextBillingDate("2024-02-29", "YEARLY")).toBe("2025-02-28");
  });
});
