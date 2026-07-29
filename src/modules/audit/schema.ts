import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { auditActionEnum, auditResultEnum } from "../../db/enums.js";
import { user } from "../auth/schema.js";

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => user.id),
  action: auditActionEnum("action").notNull(),
  resource: varchar("resource", { length: 255 }).notNull(),
  resourceId: uuid("resource_id"),
  result: auditResultEnum("result").notNull(),
  ip: varchar("ip", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  actorIdx: index("audit_log_actor_idx").on(t.actorId),
  resourceIdIdx: index("audit_log_resource_id_idx").on(t.resourceId),
  createdAtIdx: index("audit_log_created_at_idx").on(t.createdAt),
  resultIdx: index("audit_log_result_idx").on(t.result),
}));