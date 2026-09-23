import { pgTable, uuid, date, time, timestamp, index } from "drizzle-orm/pg-core";
import { user } from "../auth/schema.js";

// Consultant availability is the single source of truth for the New Consultation scheduler; there is no separate default, only what's currently in this table.
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
