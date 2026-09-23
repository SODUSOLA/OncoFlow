import crypto from "node:crypto";
import { InvoiceRepository, InvoiceItemRepository, TariffRepository } from "./repository.js";
import { Invoice } from "./entities/Invoice.js";
import { PaymentService } from "./services/PaymentService.js";
import { db } from "../../db/index.js";
import { invoice, invoiceItem } from "./schema.js";

const invoiceRepo = new InvoiceRepository();
const itemRepo = new InvoiceItemRepository();
const tariffRepo = new TariffRepository();
const paymentService = new PaymentService();

// Business logic for creating, sending, paying and voiding invoices.
export class InvoiceService {
  // Creates an invoice with line items computed from the facility's tariffs.
  async createInvoice(data: {
    patientId: string;
    facilityId: string;
    classificationId: string;
    appointmentId?: string;
  }) {
    const tariff = await tariffRepo.findByFacilityAndClassification(data.facilityId, data.classificationId);
    if (!tariff) {
      throw new Error("No tariff found for this facility and classification combination");
    }

    const total = tariff.networkFeeKobo + tariff.facilityBedFeeKobo + tariff.professionalFeeKobo + tariff.drugPriceKobo;

    const invoiceRow = await db.transaction(async (tx) => {
      const created = await tx.insert(invoice).values({
        id: crypto.randomUUID(),
        patientId: data.patientId,
        facilityId: data.facilityId,
        classificationId: data.classificationId,
        appointmentId: data.appointmentId ?? null,
        status: "DRAFT",
        totalKobo: total,
      }).returning();

      const row = created[0]!;
      await tx.insert(invoiceItem).values([
        { id: crypto.randomUUID(), invoiceId: row.id, component: "NETWORK_FEE", amountKobo: tariff.networkFeeKobo },
        { id: crypto.randomUUID(), invoiceId: row.id, component: "FACILITY_FEE", amountKobo: tariff.facilityBedFeeKobo },
        { id: crypto.randomUUID(), invoiceId: row.id, component: "PROFESSIONAL_FEE", amountKobo: tariff.professionalFeeKobo },
        { id: crypto.randomUUID(), invoiceId: row.id, component: "DRUG_COST", amountKobo: tariff.drugPriceKobo },
      ]);
      return row;
    });

    const entity = new Invoice(invoiceRow);
    return { invoice: entity.toJSON(), invoiceId: invoiceRow.id };
  }

  // For fees that aren't a tariff lookup (e.g. the time-of-day side-effect fee): the caller computes the amount and it's stored as one NETWORK_FEE item.
  async createInvoiceWithFixedFee(data: {
    patientId: string;
    facilityId: string;
    classificationId: string;
    feeKobo: bigint;
  }) {
    const invoiceRow = await db.transaction(async (tx) => {
      const created = await tx.insert(invoice).values({
        id: crypto.randomUUID(),
        patientId: data.patientId,
        facilityId: data.facilityId,
        classificationId: data.classificationId,
        status: "DRAFT",
        totalKobo: data.feeKobo,
      }).returning();

      const row = created[0]!;
      await tx.insert(invoiceItem).values([
        { id: crypto.randomUUID(), invoiceId: row.id, component: "NETWORK_FEE", amountKobo: data.feeKobo },
      ]);
      return row;
    });

    const entity = new Invoice(invoiceRow);
    return { invoice: entity.toJSON(), invoiceId: invoiceRow.id };
  }

  // Moves a draft invoice to SENT.
  async sendInvoice(invoiceId: string) {
    const row = await invoiceRepo.findById(invoiceId);
    if (!row) throw new Error("Invoice not found");

    const entity = new Invoice(row);
    const updated = entity.transition("SENT");
    await invoiceRepo.update(invoiceId, { status: "SENT", issuedAt: new Date() });

    return { invoice: updated.toJSON() };
  }

  // Pays an invoice from the patient's wallet.
  async payInvoice(invoiceId: string) {
    return paymentService.payInvoiceWithWallet(invoiceId);
  }

  // Voids an invoice.
  async voidInvoice(invoiceId: string) {
    const row = await invoiceRepo.findById(invoiceId);
    if (!row) throw new Error("Invoice not found");

    const entity = new Invoice(row);
    const updated = entity.transition("VOID");
    await invoiceRepo.update(invoiceId, { status: "VOID" });

    return { invoice: updated.toJSON() };
  }

  // Adds a line item to an invoice.
  async addItem(invoiceId: string, component: "NETWORK_FEE" | "FACILITY_FEE" | "PROFESSIONAL_FEE" | "DRUG_COST", amountKobo: bigint) {
    const row = await invoiceRepo.findById(invoiceId);
    if (!row) throw new Error("Invoice not found");
    if (row.status !== "DRAFT") {
      throw new Error("Cannot add items to a non-DRAFT invoice");
    }

    const item = await itemRepo.create({
      id: crypto.randomUUID(),
      invoiceId,
      component,
      amountKobo,
    });

    return item;
  }
}
