import { db } from "../../db/index.js";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import { shiftRequirement, shiftAssignment } from "./schema.js";

// Data access for shift requirements.
export class ShiftRequirementRepository {
  // Lists shift requirements for the given facilities.
  async findByFacilityIds(facilityIds: string[]) {
    if (facilityIds.length === 0) return [];
    return db
      .select()
      .from(shiftRequirement)
      .where(and(inArray(shiftRequirement.facilityId, facilityIds), eq(shiftRequirement.isDeleted, false)));
  }

  // Inserts a shift requirement.
  async create(data: typeof shiftRequirement.$inferInsert) {
    const row = await db.insert(shiftRequirement).values(data).returning();
    return row[0]!;
  }
}

// Data access for shift assignments.
export class ShiftAssignmentRepository {
  // Lists assignments for the facilities in an ISO week.
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

  // True when the nurse already holds this facility/day/week shift.
  async exists(data: { userId: string; facilityId: string; weekday: number; isoYear: number; isoWeek: number }) {
    const rows = await db.select({ id: shiftAssignment.id }).from(shiftAssignment).where(and(
      eq(shiftAssignment.userId, data.userId),
      eq(shiftAssignment.facilityId, data.facilityId),
      eq(shiftAssignment.weekday, data.weekday),
      eq(shiftAssignment.isoYear, data.isoYear),
      eq(shiftAssignment.isoWeek, data.isoWeek),
      eq(shiftAssignment.isDeleted, false),
    )).limit(1);
    return rows.length > 0;
  }

  // Inserts a shift assignment.
  async create(data: typeof shiftAssignment.$inferInsert) {
    const row = await db.insert(shiftAssignment).values(data).returning();
    return row[0]!;
  }

  // Self-service read of a nurse's own published assignments for a week, to spot cross-facility support.
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

  // Publishes only still-draft rows so a published week is never revised piecemeal or overwritten.
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
