import { pgTable, uuid, date, time, timestamp, index } from "drizzle-orm/pg-core";
import { user } from "../auth/schema.js";

// ONCOFLOW_SCHEDULING_AND_VIDEO_LIFECYCLE.md §1 — the literal source of truth Regional Admin's
// New Consultation scheduler reads from. No separate "default days" concept: whatever's
// currently in this table for a future date IS the default, and it simply changes when the
// consultant edits it — no versioning/history needed for a first build.
export const consultantAvailability = pgTable("consultant_availability", {
  id: uuid("id").primaryKey().defaultRandom(),
  consultantId: uuid("consultant_id").notNull().references(() => user.id),
  availableDate: date("available_date").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  consultantDateIdx: index("consultant_availability_consultant_date_idx").on(t.consultantId, t.availableDate),
}));
