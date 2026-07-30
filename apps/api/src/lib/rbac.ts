import type { Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";
import { getRedis } from "./redis.js";
import { sql } from "drizzle-orm";
import { AppError, ForbiddenError, UnauthorizedError } from "./errors.js";
// Cross-module coupling (global-conventions.md §2): every access-denied decision must produce
// an append-only AuditLog row, so the RBAC gate itself is the one place that has to know about it.
import { auditService } from "../modules/audit/index.js";

// Audit logging is a side effect, not the security decision itself — a write failure here
// (e.g. actorId with no matching user row in a test/edge case) must never turn a clean
// 401/403 into a 500.
async function safeAuditLog(event: Parameters<typeof auditService.recordEvent>[0]): Promise<void> {
  try {
    await auditService.recordEvent(event);
  } catch {
    // best-effort only
  }
}

export interface AuthenticatedRequest extends Request {
  userId: string;
  facilityId?: string;
  permissions: string[];
}

export type PermissionAction = "create" | "read" | "update" | "delete" | "approve" | "export";
export type FacilityComparator = (userFacilityId: string, resourceFacilityId: string) => boolean;

const PERMISSION_CACHE_TTL = 900;

async function resolveUserPermissions(userId: string): Promise<string[]> {
  const redis = getRedis();
  const cacheKey = `perms:${userId}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as string[];
  }

  const rows = await db.execute<{ resource: string; action: string }>(sql`
    SELECT DISTINCT p.resource, p.action
    FROM user_role ur
    JOIN role_permission rp ON rp.role_id = ur.role_id
    JOIN permission p ON p.id = rp.permission_id
    WHERE ur.user_id = ${userId}
  `);

  const perms: string[] = [];
  for (const row of rows) {
    perms.push(`${row.resource}:${row.action}`);
  }

  await redis.setex(cacheKey, PERMISSION_CACHE_TTL, JSON.stringify(perms));
  return perms;
}

async function userHasRole(userId: string, roleName: string): Promise<boolean> {
  const rows = await db.execute<{ matched: boolean }>(sql`
    SELECT EXISTS(
      SELECT 1
      FROM user_role ur
      JOIN role r ON r.id = ur.role_id
      WHERE ur.user_id = ${userId} AND r.name::text = ${roleName}
    ) AS matched
  `);
  return Boolean(rows[0]?.matched);
}

function userHasPermission(perms: string[], resource: string, action: PermissionAction): boolean {
  return perms.includes(`${resource}:${action}`);
}

export function requirePermission(resource: string, action: PermissionAction) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) {
      next(new UnauthorizedError());
      return;
    }

    try {
      if (await userHasRole(userId, "SUPER_ADMIN")) {
        (req as AuthenticatedRequest).permissions = ["*:*"];
        next();
        return;
      }

      const perms = await resolveUserPermissions(userId);
      if (!userHasPermission(perms, resource, action)) {
        await safeAuditLog({
          actorId: userId, action: "ACCESS_DENIED", resource, result: "DENIED", ip: req.ip,
        });
        next(new ForbiddenError());
        return;
      }
      (req as AuthenticatedRequest).permissions = perms;
      next();
    } catch {
      next(new AppError(500, "INTERNAL_ERROR", "Internal server error"));
    }
  };
}

export function requirePermissionScoped(
  resource: string,
  action: PermissionAction,
  getResourceFacilityId: (req: Request) => string | null,
  comparator: FacilityComparator = (userFid, resFid) => userFid === resFid,
  ) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authed = req as AuthenticatedRequest;
    if (!authed.userId || !authed.facilityId) {
      next(new UnauthorizedError());
      return;
    }

    try {
      if (await userHasRole(authed.userId, "SUPER_ADMIN")) {
        authed.permissions = ["*:*"];
        next();
        return;
      }

      const perms = await resolveUserPermissions(authed.userId);
      if (!userHasPermission(perms, resource, action)) {
        await safeAuditLog({
          actorId: authed.userId, action: "ACCESS_DENIED", resource, result: "DENIED", ip: req.ip,
        });
        next(new ForbiddenError());
        return;
      }

      const resourceFacilityId = getResourceFacilityId(req);
      if (resourceFacilityId && !comparator(authed.facilityId, resourceFacilityId)) {
        await safeAuditLog({
          actorId: authed.userId, action: "ACCESS_DENIED", resource, result: "DENIED", ip: req.ip,
        });
        next(new ForbiddenError("Forbidden: facility mismatch"));
        return;
      }

      authed.permissions = perms;
      next();
    } catch {
      next(new AppError(500, "INTERNAL_ERROR", "Internal server error"));
    }
  };
}

export async function invalidatePermissionCache(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`perms:${userId}`);
}

export async function invalidatePermissionCacheForRole(roleId: string): Promise<void> {
  const rows = await db.execute<{ user_id: string }>(sql`
    SELECT DISTINCT ur.user_id FROM user_role ur WHERE ur.role_id = ${roleId}
  `);
  const redis = getRedis();
  const pipeline = redis.pipeline();
  for (const row of rows) {
    pipeline.del(`perms:${row.user_id}`);
  }
  await pipeline.exec();
}
