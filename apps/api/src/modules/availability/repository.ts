import { db } from "../../db/index.js";
import { eq, and, isNull, gte, lte } from "drizzle-orm";
import { consultantAvailability } from "./schema.js";

// Data access for consultant availability blocks.
export class AvailabilityRepository {
  // Inserts an availability block.
  async create(data: typeof consultantAvailability.$inferInsert) {
    const row = await db.insert(consultantAvailability).values(data).returning();
    return row[0]!;
  }

  // Lists a consultant's availability blocks.
  async findByConsultant(consultantId: string) {
    return db
      .select()
      .from(consultantAvailability)
      .where(and(eq(consultantAvailability.consultantId, consultantId), isNull(consultantAvailability.deletedAt)));
  }

  // Finds one availability block by id.
  async findById(id: string) {
    const row = await db.select().from(consultantAvailability).where(eq(consultantAvailability.id, id)).limit(1);
    return row[0] ?? null;
  }

  // Soft-delete, same convention as every other deletable row in this codebase.
  async remove(id: string) {
    await db.update(consultantAvailability).set({ deletedAt: new Date() }).where(eq(consultantAvailability.id, id));
  }

  // Replaces every active block dated within [from, to] with the given rows, atomically so a failed insert never leaves the week empty.
  async replaceRange(consultantId: string, from: string, to: string, rows: (typeof consultantAvailability.$inferInsert)[]) {
    return db.transaction(async (tx) => {
      await tx.update(consultantAvailability).set({ deletedAt: new Date() }).where(and(
        eq(consultantAvailability.consultantId, consultantId),
        isNull(consultantAvailability.deletedAt),
        gte(consultantAvailability.availableDate, from),
        lte(consultantAvailability.availableDate, to),
      ));
      return tx.insert(consultantAvailability).values(rows).returning();
    });
  }
}
