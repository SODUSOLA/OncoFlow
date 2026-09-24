import { db } from "../../db/index.js";
import { eq, sql, and } from "drizzle-orm";
import { facility, department } from "./schema.js";

// Data access for facilities.
export class FacilityRepository {
  // Finds a non-deleted facility by id.
  async findById(id: string) {
    const row = await db
      .select()
      .from(facility)
      .where(sql`${facility.id} = ${id} AND ${facility.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  // Lists all non-deleted facilities.
  async findAll() {
    return db.select().from(facility).where(sql`${facility.isDeleted} = false`);
  }

  // Inserts a facility.
  async create(data: typeof facility.$inferInsert) {
    const row = await db.insert(facility).values(data).returning();
    return row[0]!;
  }

  // Updates a facility.
  async update(id: string, data: Partial<typeof facility.$inferInsert>) {
    const row = await db
      .update(facility)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(facility.id, id), eq(facility.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }

  // Soft-deletes a facility.
  async softDelete(id: string) {
    await db
      .update(facility)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(facility.id, id));
  }

  // The QUALITY_ASSURANCE_OFFICER assigned to this facility. Oldest assignment wins if a facility somehow
  // has more than one, so the answer is at least stable rather than arbitrary.
  async findQaOfficer(facilityId: string): Promise<{ id: string; email: string; firstName: string | null; lastName: string | null } | null> {
    const rows = await db.execute<{ id: string; email: string; first_name: string | null; last_name: string | null }>(sql`
      SELECT u.id, u.email, u.first_name, u.last_name FROM "user" u
      JOIN user_role ur ON ur.user_id = u.id
      JOIN role r ON r.id = ur.role_id
      WHERE r.name::text = 'QUALITY_ASSURANCE_OFFICER' AND u.facility_id = ${facilityId}
      ORDER BY u.created_at
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name };
  }
}

// Data access for departments.
export class DepartmentRepository {
  // Finds a department by id.
  async findById(id: string) {
    const row = await db
      .select()
      .from(department)
      .where(sql`${department.id} = ${id} AND ${department.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  // Lists a facility's departments.
  async findByFacility(facilityId: string) {
    return db
      .select()
      .from(department)
      .where(
        and(eq(department.facilityId, facilityId), eq(department.isDeleted, false)),
      );
  }

  // Inserts a department.
  async create(data: typeof department.$inferInsert) {
    const row = await db.insert(department).values(data).returning();
    return row[0]!;
  }

  // Updates a department.
  async update(id: string, data: Partial<typeof department.$inferInsert>) {
    const row = await db
      .update(department)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(department.id, id), eq(department.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }

  // Soft-deletes a department.
  async softDelete(id: string) {
    await db
      .update(department)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(department.id, id));
  }
}
