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
  mfaVerified?: boolean;
  mfaRequired?: boolean;
}

export type PermissionAction = "create" | "read" | "update" | "delete" | "approve" | "export" | "override" | "claim" | "call";
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

function permsInclude(perms: string[], resource: string, action: PermissionAction): boolean {
  return perms.includes(`${resource}:${action}`);
}

// Exported for the same reason as userHasRole: service/controller-layer ownership-or-permission
// checks (e.g. "allow if this is the caller's own patient record, otherwise require staff
// patient:read") can't be expressed as route middleware, since the "own record" half of the
// check needs the resource loaded first.
export async function userHasPermission(userId: string, resource: string, action: PermissionAction): Promise<boolean> {
  if (await userHasRole(userId, "SUPER_ADMIN")) return true;
  const perms = await resolveUserPermissions(userId);
  return permsInclude(perms, resource, action);
}

// Every route gate below funnels through this. It used to live inline in requireAuthenticated()
// only, which meant MFA was silently unenforced on the 32 routes gated purely by
// requirePermission/requireRole — including POST /invoices, appointment mutations and inventory
// movements. That was a bypass available to *every* role, not just SUPER_ADMIN, so the check
// belongs in one shared place that each gate must call rather than in a single middleware.
//
// Returns true when the request has been rejected (caller must stop); false to continue.
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

// Routes that must stay reachable while a session is authenticated-but-not-yet-MFA-verified,
// otherwise the user is deadlocked: they cannot complete MFA because completing MFA requires
// passing the MFA gate. /auth/mfa/verify is gated by requirePermission("auth","update"), so
// without this exemption enforcing MFA there would lock every MFA user out permanently.
// Matched against req.path; routers mount at root (app.ts) so these are the full paths.
const MFA_EXEMPT_PATHS = new Set(["/auth/mfa/verify", "/auth/logout"]);

function isMfaExempt(req: Request): boolean {
  return MFA_EXEMPT_PATHS.has(req.path);
}

// For self-service actions (logout, viewing/editing your own profile) that should work for
// any authenticated account regardless of role/permission grants — not everything behind
// auth is a permission check. Deliberately does not touch req.permissions.
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

export function requirePermission(resource: string, action: PermissionAction) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) {
      next(new UnauthorizedError());
      return;
    }

    // Deliberately ahead of the SUPER_ADMIN short-circuit: that bypass is about *permissions*,
    // and must never double as an MFA exemption for the most privileged role on the platform.
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
