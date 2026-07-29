import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { notificationStatusEnum } from "../../db/enums.js";
import { user } from "../auth/schema.js";

export const notification = pgTable("notification", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipientId: uuid("recipient_id").notNull().references(() => user.id),
  type: varchar("type", { length: 100 }).notNull(),
  status: notificationStatusEnum("status").notNull().default("PENDING"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});