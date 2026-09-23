import type { Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";
import { getRedis } from "./redis.js";
import { sql } from "drizzle-orm";
import { AppError, ForbiddenError, UnauthorizedError } from "./errors.js";
// Coupled to the audit module because every access-denied decision must leave an append-only AuditLog row.
import { auditService } from "../modules/audit/index.js";

// Audit writes are best-effort so a logging failure can't turn a clean 401/403 into a 500.
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
  mfaVerified?: boolean;
  mfaRequired?: boolean;
}

export type PermissionAction = "create" | "read" | "update" | "delete" | "approve" | "export" | "override" | "claim" | "call";
export type FacilityComparator = (userFacilityId: string, resourceFacilityId: string) => boolean;

const PERMISSION_CACHE_TTL = 900;

// Loads a user's permission strings, cached in Redis for 15 minutes.
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

// Exported for conditional service-layer role checks that route middleware can't express.
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

// True when the permission list contains resource:action.
function permsInclude(perms: string[], resource: string, action: PermissionAction): boolean {
  return perms.includes(`${resource}:${action}`);
}

// Exported for ownership-or-permission checks in services/controllers, where the resource must be loaded first.
export async function userHasPermission(userId: string, resource: string, action: PermissionAction): Promise<boolean> {
  if (await userHasRole(userId, "SUPER_ADMIN")) return true;
  const perms = await resolveUserPermissions(userId);
  return permsInclude(perms, resource, action);
}

// Shared by every route gate so MFA is enforced on permission-only and role-only routes too; returns true when the request was rejected.
async function rejectedForUnverifiedMfa(
  req: Request,
  next: NextFunction,
  resource: string,
): Promise<boolean> {
  const authed = req as AuthenticatedRequest;
  if (!authed.mfaRequired || authed.mfaVerified) return false;

  await safeAuditLog({
    actorId: authed.userId, action: "ACCESS_DENIED", resource, result: "DENIED", ip: req.ip,
  });
  next(new ForbiddenError("MFA required — complete verification via POST /auth/mfa/verify"));
  return true;
}

// Paths reachable while authenticated but not MFA-verified, so users can enrol, verify or log out instead of deadlocking.
const MFA_EXEMPT_PATHS = new Set(["/auth/mfa/enroll", "/auth/mfa/verify", "/auth/logout"]);

// True when the request path is exempt from the MFA gate.
function isMfaExempt(req: Request): boolean {
  return MFA_EXEMPT_PATHS.has(req.path);
}

// Gate for self-service actions that need a session but no role or permission grant.
export function requireAuthenticated() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authed = req as AuthenticatedRequest;
    if (!authed.userId) {
      next(new UnauthorizedError());
      return;
    }

    if (!isMfaExempt(req) && await rejectedForUnverifiedMfa(req, next, "auth")) return;

    next();
  };
}

// Gate requiring the caller to hold the resource:action permission (SUPER_ADMIN bypasses permission checks only).
export function requirePermission(resource: string, action: PermissionAction) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) {
      next(new UnauthorizedError());
      return;
    }

    // Runs before the SUPER_ADMIN short-circuit so that bypass never doubles as an MFA exemption.
    if (!isMfaExempt(req) && await rejectedForUnverifiedMfa(req, next, resource)) return;

    try {
      if (await userHasRole(userId, "SUPER_ADMIN")) {
        (req as AuthenticatedRequest).permissions = ["*:*"];
        next();
        return;
      }

      const perms = await resolveUserPermissions(userId);
      if (!permsInclude(perms, resource, action)) {
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

// Gate restricting an action to specific roles, for cases the resource:action model can't express; combine with requirePermission when needed.
export function requireRole(...roleNames: string[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) {
      next(new UnauthorizedError());
      return;
    }

    // Ahead of the SUPER_ADMIN short-circuit, same reasoning as requirePermission.
    if (!isMfaExempt(req) && await rejectedForUnverifiedMfa(req, next, `role:${roleNames.join("|")}`)) return;

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

// Gate that also requires the resource's facility to be within the caller's facility scope.
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

    // Ahead of the SUPER_ADMIN short-circuit, same reasoning as requirePermission.
    if (!isMfaExempt(req) && await rejectedForUnverifiedMfa(req, next, resource)) return;

    try {
      if (await userHasRole(authed.userId, "SUPER_ADMIN")) {
        authed.permissions = ["*:*"];
        next();
        return;
      }

      const perms = await resolveUserPermissions(authed.userId);
      if (!permsInclude(perms, resource, action)) {
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

// Drops one user's cached permissions so grant changes take effect immediately.
export async function invalidatePermissionCache(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`perms:${userId}`);
}

// Drops the cached permissions of every user holding the role.
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
