import crypto from "node:crypto";
import { AuditRepository, type AuditAction, type AuditResult } from "./repository.js";

const auditRepo = new AuditRepository();

export class AuditService {
  // `allowedFacilityIds` is the caller's own resolved scope (lib/facility-scope.js's
  // accessibleFacilityIds) — passed in rather than resolved here so this module never imports
  // lib/facility-scope.js, which itself imports this module's index.js to write ACCESS_DENIED
  // rows. Resolving it in the controller instead keeps that a one-way dependency, not a cycle.
  async getActivityFeed(allowedFacilityIds: string[] | null, limit: number) {
    const actorIds = allowedFacilityIds === null ? null : await auditRepo.findUserIdsByFacilityIds(allowedFacilityIds);
    const rows = await auditRepo.findRecent(actorIds, limit);
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      resource: r.resource,
      resourceId: r.resourceId,
      result: r.result,
      createdAt: r.createdAt.toISOString(),
      actorEmail: r.actorEmail,
    }));
  }

  async recordEvent(data: {
    actorId?: string;
    action: AuditAction;
    resource: string;
    resourceId?: string;
    result: AuditResult;
    ip?: string;
  }) {
    return auditRepo.create({
      id: crypto.randomUUID(),
      actorId: data.actorId ?? null,
      action: data.action,
      resource: data.resource,
      resourceId: data.resourceId ?? null,
      result: data.result,
      ip: data.ip ?? null,
    });
  }
}

export const auditService = new AuditService();

