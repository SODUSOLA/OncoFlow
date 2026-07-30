import crypto from "node:crypto";
import { AuditRepository, type AuditAction, type AuditResult } from "./repository.js";

const auditRepo = new AuditRepository();

export class AuditService {
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

