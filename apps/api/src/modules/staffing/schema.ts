import { pgTable, uuid, smallint, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { facility } from "../facility/schema.js";
import { user } from "../auth/schema.js";

// Standing per-facility policy: how many nurses are needed on a weekday (0=Mon..6=Sun), not tied to any specific week.
export const shiftRequirement = pgTable("shift_requirement", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull().references(() => facility.id),
  weekday: smallint("weekday").notNull(),
  requiredCount: integer("required_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});

// The actual roster for one ISO week; publishedAt stays null while a draft and is set for the whole week on publish.
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
