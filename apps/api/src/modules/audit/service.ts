import crypto from "node:crypto";
import { AuditRepository, type AuditAction, type AuditResult } from "./repository.js";

const auditRepo = new AuditRepository();

// Business logic for recording and reading audit events.
export class AuditService {
  // Takes the caller's resolved scope as a parameter so this module never imports lib/facility-scope, avoiding a circular import.
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

  // Records one audit event.
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

