import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { PaymentService } from "../services/PaymentService.js";
import { db } from "../../../db/index.js";
import { payment, walletTransaction } from "../schema.js";
import { facility } from "../../facility/schema.js";
import { patient, wallet } from "../../patient/schema.js";
import { invoice, serviceClassification, tariff } from "../schema.js";
import { user } from "../../auth/schema.js";
import { NotificationRepository } from "../../notification/index.js";
import { waitFor } from "../../../test/wait-for.js";

const paySvc = new PaymentService();

let testPatientId: string;
let testInvoiceId: string;
let testFacilityId: string;
let classId: string;

beforeAll(async () => {
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Payment Test", region: "Lagos", address: "Pay St", status: "ACTIVE",
  }).returning();
  const facId = facRows[0]!.id;
  testFacilityId = facId;

  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "PAY-TEST-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    firstName: "Payment", lastName: "Test", dob: "1990-01-01", gender: "Male",
    phone: "+2348099992222", email: "pay." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: facId, status: "ACTIVE",
  }).returning();
  testPatientId = patRows[0]!.id;

  await db.insert(wallet).values({
    id: crypto.randomUUID(), patientId: testPatientId, balanceKobo: 10000000n,
  });

  const classRows = await db.select().from(serviceClassification).where(sql`${serviceClassification.name}::text = 'CONSULTATION'`).limit(1);
  if (classRows.length === 0) {
    const created = await db.insert(serviceClassification).values({
      id: crypto.randomUUID(), name: "CONSULTATION", cappedNetworkFeeKobo: 500000n,
    }).returning();
    classId = created[0]!.id;
  } else {
    classId = classRows[0]!.id;
  }

  await db.insert(tariff).values({
    id: crypto.randomUUID(), facilityId: facId, classificationId: classId,
    networkFeeKobo: 500000n, facilityBedFeeKobo: 300000n, professionalFeeKobo: 100000n, drugPriceKobo: 200000n,
  });

  const invRows = await db.insert(invoice).values({
    id: crypto.randomUUID(), patientId: testPatientId, facilityId: facId,
    classificationId: classId, status: "SENT", totalKobo: 1000000n, issuedAt: new Date(),
  }).returning();
  testInvoiceId = invRows[0]!.id;
});

describe("PaymentService — webhook", () => {
  it("processes successful webhook and credits wallet", async () => {
    const ref = "WH-" + crypto.randomUUID();
    const result = await paySvc.processWebhookEvent({
      eventType: "SUCCESSFUL_TRANSACTION",
      reference: ref,
      amountKobo: 500000n,
      invoiceId: testInvoiceId,
    });
    expect(result.handled).toBe(true);
    expect(result.duplicate).toBe(false);

    const w = await db.select().from(wallet).where(eq(wallet.patientId, testPatientId)).limit(1);
    expect(w[0]!.balanceKobo).toBe(10500000n);
  });

  it("rejects webhook replay with same reference (no double-credit)", async () => {
    const ref = "REPLAY-" + crypto.randomUUID();
    await paySvc.processWebhookEvent({
      eventType: "SUCCESSFUL_TRANSACTION", reference: ref, amountKobo: 200000n, invoiceId: testInvoiceId,
    });

    const w1 = await db.select().from(wallet).where(eq(wallet.patientId, testPatientId)).limit(1);
    const balanceAfterFirst = w1[0]!.balanceKobo;

    const result = await paySvc.processWebhookEvent({
      eventType: "SUCCESSFUL_TRANSACTION", reference: ref, amountKobo: 200000n, invoiceId: testInvoiceId,
    });
    expect(result.duplicate).toBe(true);

    const w2 = await db.select().from(wallet).where(eq(wallet.patientId, testPatientId)).limit(1);
    expect(w2[0]!.balanceKobo).toBe(balanceAfterFirst);
  });
});

describe("PaymentService — pay invoice from wallet", () => {
  it("pays a SENT invoice and debits wallet", async () => {
    const walBefore = await db.select().from(wallet).where(eq(wallet.patientId, testPatientId)).limit(1);

    const result = await paySvc.payInvoiceWithWallet(testInvoiceId);
    expect(result.invoice.status).toBe("PAID");

    const walAfter = await db.select().from(wallet).where(eq(wallet.patientId, testPatientId)).limit(1);
    expect(walAfter[0]!.balanceKobo).toBe(walBefore[0]!.balanceKobo - 1000000n);
  });

  it("rejects payment for already-paid invoice", async () => {
    await expect(
      paySvc.payInvoiceWithWallet(testInvoiceId),
    ).rejects.toThrow("Only SENT invoices can be paid");
  });
});

describe("PaymentService — receipt email is best-effort", () => {
  it("still returns PAID even though RESEND_API_KEY isn't set in the test env", async () => {
    const invRows = await db.insert(invoice).values({
      id: crypto.randomUUID(), patientId: testPatientId, facilityId: testFacilityId,
      classificationId: classId, status: "SENT", totalKobo: 100000n, issuedAt: new Date(),
    }).returning();

    // Resend isn't configured here, but the receipt send is fire-and-forget so the payment result must be unaffected.
    const result = await paySvc.payInvoiceWithWallet(invRows[0]!.id);
    expect(result.invoice.status).toBe("PAID");
  });
});

describe("PaymentService — invoice-paid notification", () => {
  it("creates an INVOICE_PAID notification for the patient's linked userId", async () => {
    const patientUserId = crypto.randomUUID();
    await db.insert(user).values({ id: patientUserId, email: `paidnotif-${crypto.randomUUID()}@test.com`, passwordHash: "test" });

    const patRows = await db.insert(patient).values({
      id: crypto.randomUUID(), uniquePatientId: "PAY-NOTIF-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
      userId: patientUserId,
      firstName: "Notify", lastName: "Test", dob: "1990-01-01", gender: "Female",
      phone: "+2348099995555", email: "paynotif." + crypto.randomUUID().slice(0, 4) + "@test.com",
      facilityId: testFacilityId, status: "ACTIVE",
    }).returning();
    const newPatientId = patRows[0]!.id;
    await db.insert(wallet).values({ id: crypto.randomUUID(), patientId: newPatientId, balanceKobo: 1000000n });

    const invRows = await db.insert(invoice).values({
      id: crypto.randomUUID(), patientId: newPatientId, facilityId: testFacilityId,
      classificationId: classId, status: "SENT", totalKobo: 100000n, issuedAt: new Date(),
    }).returning();

    await paySvc.payInvoiceWithWallet(invRows[0]!.id);

    // The paid notification is fire-and-forget, so poll for the row rather than assuming a fixed delay.
    const notificationRepo = new NotificationRepository();
    const notifications = await waitFor(async () => {
      const rows = await notificationRepo.findByRecipient(patientUserId);
      return rows.some((n) => n.type === "INVOICE_PAID") ? rows : undefined;
    }) ?? [];
    expect(notifications.some((n) => n.type === "INVOICE_PAID")).toBe(true);
  });
});

describe("PaymentService — wallet reconciliation", () => {
  it("balance matches SUM(credits) - SUM(debits)", async () => {
    const w = await db.select().from(wallet).where(eq(wallet.patientId, testPatientId)).limit(1);
    const txns = await db.select().from(walletTransaction).where(eq(walletTransaction.walletId, w[0]!.id));

    const credits = txns.filter((t) => t.type === "CREDIT").reduce((s, t) => s + t.amountKobo, 0n);
    const debits = txns.filter((t) => t.type === "DEBIT").reduce((s, t) => s + t.amountKobo, 0n);

    expect(w[0]!.balanceKobo).toBe(10000000n + credits - debits);
  });
});
