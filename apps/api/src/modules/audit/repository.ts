import { db } from "../../db/index.js";
import { auditLog } from "./schema.js";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGOUT"
  | "EXPORT"
  | "APPROVE"
  | "DECLINE"
  | "ACCESS_DENIED";

export type AuditResult = "ALLOWED" | "DENIED";

export class AuditRepository {
  async create(data: typeof auditLog.$inferInsert) {
    const rows = await db.insert(auditLog).values(data).returning();
    return rows[0]!;
  }
}

