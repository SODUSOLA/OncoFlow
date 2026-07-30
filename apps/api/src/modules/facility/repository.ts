import { db } from "../../db/index.js";
import { eq, sql, and } from "drizzle-orm";
import { facility, department } from "./schema.js";

export class FacilityRepository {
  async findById(id: string) {
    const row = await db
      .select()
      .from(facility)
      .where(sql`${facility.id} = ${id} AND ${facility.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  async findAll() {
    return db.select().from(facility).where(sql`${facility.isDeleted} = false`);
  }

  async create(data: typeof facility.$inferInsert) {
    const row = await db.insert(facility).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof facility.$inferInsert>) {
    const row = await db
      .update(facility)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(facility.id, id), eq(facility.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }

  async softDelete(id: string) {
    await db
      .update(facility)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(facility.id, id));
  }
}

export class DepartmentRepository {
  async findById(id: string) {
    const row = await db
      .select()
      .from(department)
      .where(sql`${department.id} = ${id} AND ${department.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  async findByFacility(facilityId: string) {
    return db
      .select()
      .from(department)
      .where(
        and(eq(department.facilityId, facilityId), eq(department.isDeleted, false)),
      );
  }

  async create(data: typeof department.$inferInsert) {
    const row = await db.insert(department).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof department.$inferInsert>) {
    const row = await db
      .update(department)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(department.id, id), eq(department.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }

  async softDelete(id: string) {
    await db
      .update(department)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(department.id, id));
  }
}
