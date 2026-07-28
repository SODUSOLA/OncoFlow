import { db } from "../../db";
import { eq, sql, and, desc } from "drizzle-orm";
import { file } from "./schema";

export class FileRepository {
  async findById(id: string) {
    const row = await db
      .select()
      .from(file)
      .where(sql`${file.id} = ${id} AND ${file.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  async findByPatient(patientId: string) {
    return db
      .select()
      .from(file)
      .where(and(eq(file.patientId, patientId), eq(file.isDeleted, false)))
      .orderBy(desc(file.createdAt));
  }

  async findByHash(patientId: string, fileHash: string) {
    return db
      .select()
      .from(file)
      .where(and(
        eq(file.patientId, patientId),
        eq(file.fileHash, fileHash),
        eq(file.isDeleted, false),
      ));
  }

  async create(data: typeof file.$inferInsert) {
    const row = await db.insert(file).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof file.$inferInsert>) {
    const row = await db
      .update(file)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(file.id, id), eq(file.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }

  async softDelete(id: string) {
    const row = await db
      .update(file)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(file.id, id), eq(file.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }
}
