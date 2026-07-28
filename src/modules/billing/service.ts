import crypto from "node:crypto";
import { InvoiceRepository, InvoiceItemRepository, TariffRepository } from "./repository";
import { Invoice } from "./entities/Invoice";
import { PaymentService } from "./services/PaymentService";
import { db } from "../../db";
import { invoice, invoiceItem } from "./schema";

const invoiceRepo = new InvoiceRepository();
const itemRepo = new InvoiceItemRepository();
const tariffRepo = new TariffRepository();
const paymentService = new PaymentService();

export class InvoiceService {
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

    const total = tariff.networkFeeKobo + tariff.facilityBedFeeKobo + tariff.drugPriceKobo;

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
        { id: crypto.randomUUID(), invoiceId: row.id, component: "DRUG_COST", amountKobo: tariff.drugPriceKobo },
      ]);
      return row;
    });

    const entity = new Invoice(invoiceRow);
    return { invoice: entity.toJSON(), invoiceId: invoiceRow.id };
  }

  async sendInvoice(invoiceId: string) {
    const row = await invoiceRepo.findById(invoiceId);
    if (!row) throw new Error("Invoice not found");

    const entity = new Invoice(row);
    const updated = entity.transition("SENT");
    await invoiceRepo.update(invoiceId, { status: "SENT", issuedAt: new Date() });

    return { invoice: updated.toJSON() };
  }

  async payInvoice(invoiceId: string) {
    return paymentService.payInvoiceWithWallet(invoiceId);
  }

  async voidInvoice(invoiceId: string) {
    const row = await invoiceRepo.findById(invoiceId);
    if (!row) throw new Error("Invoice not found");

    const entity = new Invoice(row);
    const updated = entity.transition("VOID");
    await invoiceRepo.update(invoiceId, { status: "VOID" });

    return { invoice: updated.toJSON() };
  }

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
