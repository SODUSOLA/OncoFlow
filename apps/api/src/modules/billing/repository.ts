import { db } from "../../db/index.js";
import { drug } from "../inventory/schema.js";
import { eq, sql, and, desc, inArray } from "drizzle-orm";
import { serviceClassification, serviceSubOption, serviceSubOptionPrice, invoiceLine, invoiceLineDrug, tariff, invoice, invoiceItem, subscription, walletTransaction } from "./schema.js";

// Data access for the named variants under each classification.
export class ServiceSubOptionRepository {
  async findAll() {
    return db.select().from(serviceSubOption).orderBy(serviceSubOption.sortOrder, serviceSubOption.name);
  }

  async findById(id: string) {
    const row = await db.select().from(serviceSubOption).where(eq(serviceSubOption.id, id)).limit(1);
    return row[0] ?? null;
  }

  // Sub-options with the price row for one tier, keyed by sub-option id.
  async findWithPrices(ids: string[], isSubscriber: boolean) {
    if (ids.length === 0) return [];
    const options = await db.select().from(serviceSubOption).where(inArray(serviceSubOption.id, ids));
    const prices = await db.select().from(serviceSubOptionPrice)
      .where(and(inArray(serviceSubOptionPrice.subOptionId, ids), eq(serviceSubOptionPrice.isSubscriber, isSubscriber)));
    return options.map((o) => ({ option: o, price: prices.find((p) => p.subOptionId === o.id) ?? null }));
  }
}

// Data access for the billed services on an invoice.
export class InvoiceLineRepository {
  // Lists an invoice's lines, each with the drugs recorded under it.
  async findByInvoice(invoiceId: string) {
    const lines = await db.select().from(invoiceLine).where(eq(invoiceLine.invoiceId, invoiceId)).orderBy(invoiceLine.createdAt);
    if (lines.length === 0) return [];
    const drugs = await db
      .select({ lineId: invoiceLineDrug.invoiceLineId, id: drug.id, name: drug.name, strength: drug.strength })
      .from(invoiceLineDrug)
      .innerJoin(drug, eq(drug.id, invoiceLineDrug.drugId))
      .where(inArray(invoiceLineDrug.invoiceLineId, lines.map((l) => l.id)));
    return lines.map((l) => ({ ...l, drugs: drugs.filter((d) => d.lineId === l.id).map(({ lineId: _lineId, ...d }) => d) }));
  }
}

// Data access for service classifications.
export class ServiceClassificationRepository {
  // Finds a classification by id.
  async findById(id: string) {
    const row = await db.select().from(serviceClassification).where(eq(serviceClassification.id, id)).limit(1);
    return row[0] ?? null;
  }

  // Finds a classification by name.
  async findByName(name: string) {
    const row = await db
      .select()
      .from(serviceClassification)
      .where(sql`${serviceClassification.name}::text = ${name}`)
      .limit(1);
    return row[0] ?? null;
  }

  // Lists all classifications.
  async findAll() {
    return db.select().from(serviceClassification).orderBy(serviceClassification.name);
  }

  // Inserts a classification.
  async create(data: typeof serviceClassification.$inferInsert) {
    const row = await db.insert(serviceClassification).values(data).returning();
    return row[0]!;
  }
}

// Data access for tariffs.
export class TariffRepository {
  // Finds a tariff by id.
  async findById(id: string) {
    const row = await db
      .select()
      .from(tariff)
      .where(sql`${tariff.id} = ${id} AND ${tariff.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  // Lists a facility's tariffs.
  async findByFacility(facilityId: string) {
    return db
      .select()
      .from(tariff)
      .where(and(eq(tariff.facilityId, facilityId), eq(tariff.isDeleted, false)));
  }

  // See InvoiceRepository.findByFacilityIds — same authorization-narrowed contract.
  async findByFacilityIds(facilityIds: string[]) {
    return db
      .select()
      .from(tariff)
      .where(and(inArray(tariff.facilityId, facilityIds), eq(tariff.isDeleted, false)));
  }

  // Finds the tariff for a facility and classification.
  async findByFacilityAndClassification(facilityId: string, classificationId: string) {
    const row = await db
      .select()
      .from(tariff)
      .where(
        and(
          eq(tariff.facilityId, facilityId),
          eq(tariff.classificationId, classificationId),
          eq(tariff.isDeleted, false),
        ),
      )
      .limit(1);
    return row[0] ?? null;
  }

  // Inserts a tariff, refusing duplicates for the same facility and classification.
  async create(data: typeof tariff.$inferInsert) {
    const existing = await this.findByFacilityAndClassification(data.facilityId, data.classificationId);
    if (existing) {
      throw new Error("Tariff already exists for this facility and classification");
    }
    const row = await db.insert(tariff).values(data).returning();
    return row[0]!;
  }

  // Updates a tariff.
  async update(id: string, data: Partial<typeof tariff.$inferInsert>) {
    const row = await db
      .update(tariff)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(tariff.id, id), eq(tariff.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }

  // Soft-deletes a tariff.
  async softDelete(id: string) {
    await db
      .update(tariff)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(tariff.id, id));
  }
}

// Data access for invoices.
export class InvoiceRepository {
  // Finds an invoice by id.
  async findById(id: string) {
    const row = await db
      .select()
      .from(invoice)
      .where(sql`${invoice.id} = ${id} AND ${invoice.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  // Lists a patient's invoices.
  async findByPatient(patientId: string) {
    return db
      .select()
      .from(invoice)
      .where(and(eq(invoice.patientId, patientId), eq(invoice.isDeleted, false)))
      .orderBy(invoice.createdAt);
  }

  // Lists a facility's invoices.
  async findByFacility(facilityId: string) {
    return db
      .select()
      .from(invoice)
      .where(and(eq(invoice.facilityId, facilityId), eq(invoice.isDeleted, false)))
      .orderBy(invoice.createdAt);
  }

  // Takes the authorization-narrowed facility set; an empty array yields no rows, which is correct.
  async findByFacilityIds(facilityIds: string[]) {
    return db
      .select()
      .from(invoice)
      .where(and(inArray(invoice.facilityId, facilityIds), eq(invoice.isDeleted, false)))
      .orderBy(invoice.createdAt);
  }

  // Lists every invoice.
  async findAll() {
    return db
      .select()
      .from(invoice)
      .where(eq(invoice.isDeleted, false))
      .orderBy(invoice.createdAt);
  }

  // Inserts an invoice.
  async create(data: typeof invoice.$inferInsert) {
    const row = await db.insert(invoice).values(data).returning();
    return row[0]!;
  }

  // Updates an invoice.
  async update(id: string, data: Partial<typeof invoice.$inferInsert>) {
    const row = await db
      .update(invoice)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(invoice.id, id), eq(invoice.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }
}

// Data access for invoice line items.
export class InvoiceItemRepository {
  // Lists an invoice's line items.
  async findByInvoice(invoiceId: string) {
    return db.select().from(invoiceItem).where(eq(invoiceItem.invoiceId, invoiceId)).orderBy(invoiceItem.createdAt);
  }

  // Inserts a line item.
  async create(data: typeof invoiceItem.$inferInsert) {
    const row = await db.insert(invoiceItem).values(data).returning();
    return row[0]!;
  }
}

// Data access for wallet transactions.
export class WalletTransactionRepository {
  // Lists a wallet's transactions.
  async findByWallet(walletId: string) {
    return db
      .select()
      .from(walletTransaction)
      .where(eq(walletTransaction.walletId, walletId))
      .orderBy(desc(walletTransaction.createdAt));
  }
}

// Data access for subscriptions.
export class SubscriptionRepository {
  // Finds a subscription by id.
  async findById(id: string) {
    const row = await db
      .select()
      .from(subscription)
      .where(sql`${subscription.id} = ${id} AND ${subscription.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  // Lists a patient's subscriptions.
  async findByPatient(patientId: string) {
    return db
      .select()
      .from(subscription)
      .where(and(eq(subscription.patientId, patientId), eq(subscription.isDeleted, false)));
  }

  // Inserts a subscription.
  async create(data: typeof subscription.$inferInsert) {
    const row = await db.insert(subscription).values(data).returning();
    return row[0]!;
  }

  // Updates a subscription.
  async update(id: string, data: Partial<typeof subscription.$inferInsert>) {
    const row = await db
      .update(subscription)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(subscription.id, id), eq(subscription.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }
}
