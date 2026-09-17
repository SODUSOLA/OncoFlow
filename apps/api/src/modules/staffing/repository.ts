import { db } from "../../db/index.js";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import { shiftRequirement, shiftAssignment } from "./schema.js";

export class ShiftRequirementRepository {
  async findByFacilityIds(facilityIds: string[]) {
    if (facilityIds.length === 0) return [];
    return db
      .select()
      .from(shiftRequirement)
      .where(and(inArray(shiftRequirement.facilityId, facilityIds), eq(shiftRequirement.isDeleted, false)));
  }

  async create(data: typeof shiftRequirement.$inferInsert) {
    const row = await db.insert(shiftRequirement).values(data).returning();
    return row[0]!;
  }
}

export class ShiftAssignmentRepository {
  async findForWeek(facilityIds: string[], isoYear: number, isoWeek: number) {
    if (facilityIds.length === 0) return [];
    return db
      .select()
      .from(shiftAssignment)
      .where(and(
        inArray(shiftAssignment.facilityId, facilityIds),
        eq(shiftAssignment.isoYear, isoYear),
        eq(shiftAssignment.isoWeek, isoWeek),
        eq(shiftAssignment.isDeleted, false),
      ));
  }

  async create(data: typeof shiftAssignment.$inferInsert) {
    const row = await db.insert(shiftAssignment).values(data).returning();
    return row[0]!;
  }

  // Self-service read — a nurse checking their OWN published assignments for a week (the
  // Nursing Officer Schedule tab's cross-support banner: is any of it at a facility other than
  // my own?). No facility filter, since ownership is already the userId match.
  async findForUserWeek(userId: string, isoYear: number, isoWeek: number) {
    return db
      .select()
      .from(shiftAssignment)
      .where(and(
        eq(shiftAssignment.userId, userId),
        eq(shiftAssignment.isoYear, isoYear),
        eq(shiftAssignment.isoWeek, isoWeek),
        eq(shiftAssignment.isDeleted, false),
      ));
  }

  // Publishing is a batch action over a whole week's still-draft rows — a nurse's schedule
  // shouldn't be revised piecemeal after the week's been published, so this only ever
  // transitions draft (publishedAt IS NULL) rows, never re-publishes/overwrites one already set.
  async publishWeek(facilityIds: string[], isoYear: number, isoWeek: number) {
    if (facilityIds.length === 0) return 0;
    const rows = await db
      .update(shiftAssignment)
      .set({ publishedAt: sql`now()` })
      .where(and(
        inArray(shiftAssignment.facilityId, facilityIds),
        eq(shiftAssignment.isoYear, isoYear),
        eq(shiftAssignment.isoWeek, isoWeek),
        eq(shiftAssignment.isDeleted, false),
        isNull(shiftAssignment.publishedAt),
      ))
      .returning();
    return rows.length;
  }
}
