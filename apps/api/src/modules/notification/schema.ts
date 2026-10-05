import { pgTable, uuid, varchar, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
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
// [no soft delete] One row per browser/device that agreed to receive push alerts. A dead endpoint has no audit
// value, so it is simply removed. Devices deliberately survive sign-out: alerts keep reaching a signed-out
// user until they turn notifications off for that device.
export const pushSubscription = pgTable("push_subscription", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => user.id),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: varchar("user_agent", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  endpointUnique: uniqueIndex("push_subscription_endpoint_unique").on(t.endpoint),
  userIdx: index("push_subscription_user_idx").on(t.userId),
}));
