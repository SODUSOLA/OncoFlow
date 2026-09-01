import { pgTable, uuid, smallint, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { facility } from "../facility/schema.js";
import { user } from "../auth/schema.js";

// A standing per-facility staffing target, not week-specific — how many nurses a facility
// needs on a given weekday, as ongoing policy. Weekday: 0=Mon .. 6=Sun (matches
// appointment/entities/weekly-structure.ts's lagosDayOfWeek convention, shifted so Monday is 0
// rather than that function's Sunday-indexed scale, since this module has no existing
// precedent to match and Monday-first reads naturally for a weekly staffing grid).
export const shiftRequirement = pgTable("shift_requirement", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull().references(() => facility.id),
  weekday: smallint("weekday").notNull(),
  requiredCount: integer("required_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});

// One row per nurse assigned to a facility+weekday for a specific ISO week — unlike
// shiftRequirement (policy), this is the actual roster for a real calendar week.
// publishedAt is null while still a draft; Publish Schedule sets it for a whole week's rows
// at once so a nurse's schedule doesn't change under them after publication.
export const shiftAssignment = pgTable("shift_assignment", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull().references(() => facility.id),
  weekday: smallint("weekday").notNull(),
  isoYear: integer("iso_year").notNull(),
  isoWeek: integer("iso_week").notNull(),
  userId: uuid("user_id").notNull().references(() => user.id),
  assignedBy: uuid("assigned_by").notNull().references(() => user.id),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  publishedAt: timestamp("published_at"),
  isDeleted: boolean("is_deleted").notNull().default(false),
});
