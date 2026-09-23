import { db } from "../../db/index.js";
import { eq, and, isNull } from "drizzle-orm";
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
}
