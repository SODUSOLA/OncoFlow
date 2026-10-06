import crypto from "node:crypto";
import { db } from "../../../db/index.js";
import { drug } from "../../inventory/schema.js";
import { inArray, and, eq } from "drizzle-orm";
import { invoice, invoiceItem, invoiceLine, invoiceLineDrug } from "../schema.js";
import { ServiceClassificationRepository, ServiceSubOptionRepository, SubscriptionRepository } from "../repository.js";
import { Invoice } from "../entities/Invoice.js";
import { lagosToday } from "../entities/subscription-pricing.js";

const classificationRepo = new ServiceClassificationRepository();
const subOptionRepo = new ServiceSubOptionRepository();
const subscriptionRepo = new SubscriptionRepository();

// Membership is billed automatically from the patient app, and side-effect reports are paid upfront in chat, so neither is hand-invoiced.
const NOT_INVOICEABLE = new Set(["SUBSCRIPTION", "SIDE_EFFECT_REPORT"]);

export interface InvoiceLineRequest {
  subOptionId: string;
  // Only meaningful for drug administration; recorded for the visit and covered by that line's flat fee.
  drugIds?: string[];
}

// Prices a set of services from the flat price list and creates multi-line invoices from them.
export class InvoiceBuilder {
  // True while the patient holds a current membership, which selects the discounted price tier.
  async isSubscriber(patientId: string): Promise<boolean> {
    const today = lagosToday();
    const rows = await subscriptionRepo.findByPatient(patientId);
    return rows.some((r) => r.status === "ACTIVE" && r.nextBillingDate >= today);
  }

  // Validates the requested lines and prices each at the patient's tier.
  async quote(patientId: string, requested: InvoiceLineRequest[]) {
    if (requested.length === 0) throw new Error("Add at least one service");
    const ids = requested.map((l) => l.subOptionId);
    if (new Set(ids).size !== ids.length) throw new Error("A service can only be added once");

    const isSubscriber = await this.isSubscriber(patientId);
    const priced = await subOptionRepo.findWithPrices(ids, isSubscriber);

    const lines = [];
    for (const req of requested) {
      const found = priced.find((p) => p.option.id === req.subOptionId);
      if (!found) throw new Error("Unknown service option");
      if (!found.price) throw new Error(`No price is configured for ${found.option.name}`);
      const classification = await classificationRepo.findById(found.option.classificationId);
      if (!classification || NOT_INVOICEABLE.has(classification.name)) throw new Error("This service cannot be invoiced");

      const drugIds = [...new Set(req.drugIds ?? [])];
      if (drugIds.length > 0) {
        if (classification.name !== "DRUG_ADMINISTRATION") throw new Error("Drugs can only be added to a drug administration");
        const rows = await db.select({ id: drug.id }).from(drug).where(and(inArray(drug.id, drugIds), eq(drug.isDeleted, false)));
        if (rows.length !== drugIds.length) throw new Error("Unknown drug selected");
      }

      const p = found.price;
      const drugCost = p.medicationKobo + p.consumablesKobo + p.administrationKobo;
      lines.push({
        subOptionId: found.option.id,
        classificationId: found.option.classificationId,
        classificationName: classification.name,
        description: found.option.name,
        drugIds,
        components: { network: p.networkFeeKobo, facility: p.facilityFeeKobo, professional: p.professionalFeeKobo, drug: drugCost },
        amountKobo: drugCost + p.networkFeeKobo + p.facilityFeeKobo + p.professionalFeeKobo,
      });
    }
    return { isSubscriber, lines, totalKobo: lines.reduce((sum, l) => sum + l.amountKobo, 0n) };
  }

  // Creates one DRAFT invoice carrying every requested service; its component items are the sums across lines.
  async create(data: { patientId: string; facilityId: string; lines: InvoiceLineRequest[]; appointmentId?: string }) {
    const quote = await this.quote(data.patientId, data.lines);
    const sum = (pick: (l: (typeof quote.lines)[number]) => bigint) => quote.lines.reduce((acc, l) => acc + pick(l), 0n);

    const row = await db.transaction(async (tx) => {
      const created = (await tx.insert(invoice).values({
        id: crypto.randomUUID(),
        patientId: data.patientId,
        facilityId: data.facilityId,
        classificationId: quote.lines[0]!.classificationId,
        appointmentId: data.appointmentId ?? null,
        status: "DRAFT",
        totalKobo: quote.totalKobo,
      }).returning())[0]!;

      await tx.insert(invoiceItem).values([
        { id: crypto.randomUUID(), invoiceId: created.id, component: "NETWORK_FEE", amountKobo: sum((l) => l.components.network) },
        { id: crypto.randomUUID(), invoiceId: created.id, component: "FACILITY_FEE", amountKobo: sum((l) => l.components.facility) },
        { id: crypto.randomUUID(), invoiceId: created.id, component: "PROFESSIONAL_FEE", amountKobo: sum((l) => l.components.professional) },
        { id: crypto.randomUUID(), invoiceId: created.id, component: "DRUG_COST", amountKobo: sum((l) => l.components.drug) },
      ]);

      for (const line of quote.lines) {
        const lineId = crypto.randomUUID();
        await tx.insert(invoiceLine).values({
          id: lineId, invoiceId: created.id, classificationId: line.classificationId,
          subOptionId: line.subOptionId, description: line.description, amountKobo: line.amountKobo,
        });
        if (line.drugIds.length > 0) {
          await tx.insert(invoiceLineDrug).values(line.drugIds.map((drugId) => ({ id: crypto.randomUUID(), invoiceLineId: lineId, drugId })));
        }
      }
      return created;
    });

    return { invoice: new Invoice(row).toJSON(), invoiceId: row.id, isSubscriber: quote.isSubscriber };
  }
}
