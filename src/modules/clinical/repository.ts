import { db } from "../../db/index.js";
import { eq, sql, and, gt } from "drizzle-orm";
import { countdownCase } from "./schema.js";

export class CountdownCaseRepository {
  async findById(id: string) {
    const row = await db
      .select()
      .from(countdownCase)
      .where(sql`${countdownCase.id} = ${id} AND ${countdownCase.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  async findByPatient(patientId: string) {
    return db
      .select()
      .from(countdownCase)
      .where(and(eq(countdownCase.patientId, patientId), eq(countdownCase.isDeleted, false)))
      .orderBy(countdownCase.createdAt);
  }

  async findActive() {
    return db
      .select()
      .from(countdownCase)
      .where(and(eq(countdownCase.status, "ACTIVE"), eq(countdownCase.isDeleted, false), gt(countdownCase.currentDay, 0)));
  }

  async create(data: typeof countdownCase.$inferInsert) {
    const row = await db.insert(countdownCase).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof countdownCase.$inferInsert>) {
    const row = await db
      .update(countdownCase)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(countdownCase.id, id), eq(countdownCase.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }
}
