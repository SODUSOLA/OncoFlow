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

export type PermissionAction = "create" | "read" | "update" | "delete" | "approve" | "export" | "override" | "claim";
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

// Exported for service-layer role checks that are conditional, not a blanket route gate —
// e.g. "require triage_checklist_id only when the prescriber is specifically an MO" can't be
// expressed as route middleware since the same route legitimately serves multiple roles.
export async function userHasRole(userId: string, roleName: string): Promise<boolean> {
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

// For self-service actions (logout, viewing/editing your own profile) that should work for
// any authenticated account regardless of role/permission grants — not everything behind
// auth is a permission check. Deliberately does not touch req.permissions.
export function requireAuthenticated() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!(req as AuthenticatedRequest).userId) {
      next(new UnauthorizedError());
      return;
    }
    next();
  };
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

// For actions restricted to specific roles regardless of the generic resource:action permission
// model — e.g. "only a Virtual Medical Officer can complete a triage checklist," "only an
// Onsite Nursing Officer can open a physical case." requirePermission's resource:action grants
// don't express "and it must specifically be role X, not just anyone with this permission" —
// use this alongside requirePermission (both as separate middleware) when that distinction matters.
export function requireRole(...roleNames: string[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) {
      next(new UnauthorizedError());
      return;
    }

    try {
      if (await userHasRole(userId, "SUPER_ADMIN")) {
        next();
        return;
      }
      for (const roleName of roleNames) {
        if (await userHasRole(userId, roleName)) {
          next();
          return;
        }
      }
      await safeAuditLog({
        actorId: userId, action: "ACCESS_DENIED", resource: `role:${roleNames.join("|")}`, result: "DENIED", ip: req.ip,
      });
      next(new ForbiddenError());
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
