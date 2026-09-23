import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { auditLog } from "./schema.js";
import { user } from "../auth/schema.js";

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

export interface AuditActivityRow {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  result: string;
  createdAt: Date;
  actorEmail: string | null;
}

// Data access for the append-only audit log.
export class AuditRepository {
  // Inserts one audit row.
  async create(data: typeof auditLog.$inferInsert) {
    const rows = await db.insert(auditLog).values(data).returning();
    return rows[0]!;
  }

  // audit_log has no facility column, so region scoping resolves the region's staff user ids first and filters on those.
  async findUserIdsByFacilityIds(facilityIds: string[]): Promise<string[]> {
    if (facilityIds.length === 0) return [];
    const rows = await db.select({ id: user.id }).from(user).where(inArray(user.facilityId, facilityIds));
    return rows.map((r) => r.id);
  }

  // actorIds null means unrestricted; an empty array means the region has no staff, which is a genuine empty result.
  async findRecent(actorIds: string[] | null, limit: number): Promise<AuditActivityRow[]> {
    if (actorIds !== null && actorIds.length === 0) return [];

    const rows = await db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        resource: auditLog.resource,
        resourceId: auditLog.resourceId,
        result: auditLog.result,
        createdAt: auditLog.createdAt,
        actorEmail: user.email,
      })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.actorId))
      .where(actorIds === null ? undefined : inArray(auditLog.actorId, actorIds))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);

    return rows.map((r) => ({ ...r, actorEmail: r.actorEmail ?? null }));
  }
}
