import { db } from "../../db/index.js";
import { eq, sql, and, desc, inArray } from "drizzle-orm";
import { serviceClassification, tariff, invoice, invoiceItem, subscription, walletTransaction } from "./schema.js";

export class ServiceClassificationRepository {
  async findById(id: string) {
    const row = await db.select().from(serviceClassification).where(eq(serviceClassification.id, id)).limit(1);
    return row[0] ?? null;
  }

  async findByName(name: string) {
    const row = await db
      .select()
      .from(serviceClassification)
      .where(sql`${serviceClassification.name}::text = ${name}`)
      .limit(1);
    return row[0] ?? null;
  }

  async findAll() {
    return db.select().from(serviceClassification).orderBy(serviceClassification.name);
  }

  async create(data: typeof serviceClassification.$inferInsert) {
    const row = await db.insert(serviceClassification).values(data).returning();
    return row[0]!;
  }
}

export class TariffRepository {
  async findById(id: string) {
    const row = await db
      .select()
      .from(tariff)
      .where(sql`${tariff.id} = ${id} AND ${tariff.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

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

  async create(data: typeof tariff.$inferInsert) {
    const existing = await this.findByFacilityAndClassification(data.facilityId, data.classificationId);
    if (existing) {
      throw new Error("Tariff already exists for this facility and classification");
    }
    const row = await db.insert(tariff).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof tariff.$inferInsert>) {
    const row = await db
      .update(tariff)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(tariff.id, id), eq(tariff.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }

  async softDelete(id: string) {
    await db
      .update(tariff)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(tariff.id, id));
  }
}

export class InvoiceRepository {
  async findById(id: string) {
    const row = await db
      .select()
      .from(invoice)
      .where(sql`${invoice.id} = ${id} AND ${invoice.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  async findByPatient(patientId: string) {
    return db
      .select()
      .from(invoice)
      .where(and(eq(invoice.patientId, patientId), eq(invoice.isDeleted, false)))
      .orderBy(invoice.createdAt);
  }

  async findByFacility(facilityId: string) {
    return db
      .select()
      .from(invoice)
      .where(and(eq(invoice.facilityId, facilityId), eq(invoice.isDeleted, false)))
      .orderBy(invoice.createdAt);
  }

  // Takes the authorization-narrowed set from lib/facility-scope.ts. An empty array is a valid
  // "nothing in scope" and inArray renders it false, yielding no rows — the correct answer.
  async findByFacilityIds(facilityIds: string[]) {
    return db
      .select()
      .from(invoice)
      .where(and(inArray(invoice.facilityId, facilityIds), eq(invoice.isDeleted, false)))
      .orderBy(invoice.createdAt);
  }

  async findAll() {
    return db
      .select()
      .from(invoice)
      .where(eq(invoice.isDeleted, false))
      .orderBy(invoice.createdAt);
  }

  async create(data: typeof invoice.$inferInsert) {
    const row = await db.insert(invoice).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof invoice.$inferInsert>) {
    const row = await db
      .update(invoice)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(invoice.id, id), eq(invoice.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }
}

export class InvoiceItemRepository {
  async findByInvoice(invoiceId: string) {
    return db.select().from(invoiceItem).where(eq(invoiceItem.invoiceId, invoiceId)).orderBy(invoiceItem.createdAt);
  }

  async create(data: typeof invoiceItem.$inferInsert) {
    const row = await db.insert(invoiceItem).values(data).returning();
    return row[0]!;
  }
}

export class WalletTransactionRepository {
  async findByWallet(walletId: string) {
    return db
      .select()
      .from(walletTransaction)
      .where(eq(walletTransaction.walletId, walletId))
      .orderBy(desc(walletTransaction.createdAt));
  }
}

export class SubscriptionRepository {
  async findById(id: string) {
    const row = await db
      .select()
      .from(subscription)
      .where(sql`${subscription.id} = ${id} AND ${subscription.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  async findByPatient(patientId: string) {
    return db
      .select()
      .from(subscription)
      .where(and(eq(subscription.patientId, patientId), eq(subscription.isDeleted, false)));
  }

  async create(data: typeof subscription.$inferInsert) {
    const row = await db.insert(subscription).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof subscription.$inferInsert>) {
    const row = await db
      .update(subscription)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(subscription.id, id), eq(subscription.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }
}
