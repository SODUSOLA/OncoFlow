import crypto from "node:crypto";
import { InvoiceService } from "../service.js";
import { PaymentService } from "./PaymentService.js";
import { InvoiceRepository, ServiceClassificationRepository, SubscriptionRepository } from "../repository.js";
import { Invoice } from "../entities/Invoice.js";
import {
  SUBSCRIPTION_FEE_KOBO, RENEWAL_WINDOW_DAYS, lagosToday, addDays, nextBillingDate, type SubscriptionCycle,
} from "../entities/subscription-pricing.js";
import { PatientRepository } from "../../patient/index.js";

const invoiceSvc = new InvoiceService();
const paymentSvc = new PaymentService();
const invoiceRepo = new InvoiceRepository();
const classificationRepo = new ServiceClassificationRepository();
const subscriptionRepo = new SubscriptionRepository();
const patientRepo = new PatientRepository();

export type SubscriptionState = "NONE" | "ACTIVE" | "EXPIRED";

// Membership: prepaid for one term from the wallet and renewed by paying again, so there is no background billing job.
export class SubscriptionService {
  // Returns the patient's membership state, marking a lapsed one EXPIRED first.
  async current(patientId: string) {
    const today = lagosToday();
    const rows = await subscriptionRepo.findByPatient(patientId);
    let row = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
    if (row && row.status === "ACTIVE" && row.nextBillingDate < today) {
      row = (await subscriptionRepo.update(row.id, { status: "EXPIRED" })) ?? row;
    }
    const state: SubscriptionState = !row ? "NONE" : row.status === "ACTIVE" ? "ACTIVE" : "EXPIRED";
    const canRenew = state !== "ACTIVE" || row!.nextBillingDate <= addDays(today, RENEWAL_WINDOW_DAYS);
    return {
      state,
      canRenew,
      subscription: row && {
        id: row.id,
        billingCycle: row.billingCycle,
        status: row.status,
        nextBillingDate: row.nextBillingDate,
        startedAt: row.startedAt.toISOString(),
      },
      prices: {
        MONTHLY: SUBSCRIPTION_FEE_KOBO.MONTHLY.toString(),
        YEARLY: SUBSCRIPTION_FEE_KOBO.YEARLY.toString(),
      },
    };
  }

  // Charges the term fee to the wallet and activates (or extends) the membership; returns the unpaid invoice when the wallet can't cover it.
  async subscribe(patientId: string, cycle: SubscriptionCycle) {
    const status = await this.current(patientId);
    if (!status.canRenew) throw new Error("Your membership is active — you can renew it closer to its end date");

    const patientRow = await patientRepo.findById(patientId);
    if (!patientRow) throw new Error("Patient not found");
    const classification = await classificationRepo.findByName("SUBSCRIPTION");
    if (!classification) throw new Error("Subscription billing is not configured");

    const { invoiceId } = await invoiceSvc.createInvoiceWithFixedFee({
      patientId,
      facilityId: patientRow.facilityId,
      classificationId: classification.id,
      feeKobo: SUBSCRIPTION_FEE_KOBO[cycle],
    });
    await invoiceSvc.sendInvoice(invoiceId);

    try {
      await paymentSvc.payInvoiceWithWallet(invoiceId);
    } catch {
      const unpaid = await invoiceRepo.findById(invoiceId);
      return { paid: false as const, invoice: new Invoice(unpaid!).toJSON() };
    }

    const today = lagosToday();
    // Renewing early starts the new term where the current one ends, so no paid days are lost.
    const termStart = status.subscription && status.state === "ACTIVE" ? status.subscription.nextBillingDate : today;
    const endsOn = nextBillingDate(termStart, cycle);
    if (status.subscription) {
      await subscriptionRepo.update(status.subscription.id, { billingCycle: cycle, status: "ACTIVE", nextBillingDate: endsOn });
    } else {
      await subscriptionRepo.create({
        id: crypto.randomUUID(), patientId, billingCycle: cycle, status: "ACTIVE", nextBillingDate: endsOn, startedAt: new Date(),
      });
    }
    return { paid: true as const, ...(await this.current(patientId)) };
  }
}
