import type { Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { userHasRole, type AuthenticatedRequest } from "./rbac.js";
// Coupled to the audit module like rbac.ts, since a denied facility access must leave an audit row.
import { auditService } from "../modules/audit/index.js";

// Returns the facility ids a caller may see (their whole region, not one facility), or null for unrestricted callers such as SUPER_ADMIN and national roles.
export async function accessibleFacilityIds(userId: string): Promise<string[] | null> {
  if (await userHasRole(userId, "SUPER_ADMIN")) return null;

  const rows = await db.execute<{ facility_id: string | null }>(sql`
    SELECT facility_id FROM "user" WHERE id = ${userId} LIMIT 1
  `);
  const ownFacilityId = rows[0]?.facility_id ?? null;
  if (!ownFacilityId) return null;

  const inRegion = await db.execute<{ id: string }>(sql`
    SELECT f.id
    FROM facility f
    WHERE f.is_deleted = false
      AND f.region = (SELECT region FROM facility WHERE id = ${ownFacilityId})
  `);
  return inRegion.map((r) => r.id);
}

// Narrows a requested ?facilityId against the caller's scope, keeping authorization (may they see it) separate from filtering (what they asked for).
export type FacilityScopeResolution =
  | { kind: "unrestricted" }
  | { kind: "forbidden" }
  | { kind: "restricted"; facilityIds: string[] };

// Pure resolver: forbidden for an explicit id outside scope; "all" or omitted yields the caller's accessible facilities or unrestricted.
export function resolveRequestedFacilityScope(
  requested: string | undefined,
  allowed: string[] | null,
): FacilityScopeResolution {
  const wantsSpecific = !!requested && requested !== "all";

  if (allowed === null) {
    // Unrestricted: no authorization limit, but still honour an explicit filter.
    return wantsSpecific ? { kind: "restricted", facilityIds: [requested] } : { kind: "unrestricted" };
  }

  if (wantsSpecific) {
    return allowed.includes(requested)
      ? { kind: "restricted", facilityIds: [requested] }
      : { kind: "forbidden" };
  }

  return { kind: "restricted", facilityIds: allowed };
}

// The allowed outcomes only, since `forbidden` is turned into a 403 inside resolveScopeOrDeny and never reaches callers.
export type AllowedFacilityScope = Exclude<FacilityScopeResolution, { kind: "forbidden" }>;

// Controller helper that resolves ?facilityId, and on refusal audits and sends the 403 itself, returning null so the handler can just return.
export async function resolveScopeOrDeny(
  req: Request,
  res: Response,
  resource: string,
): Promise<AllowedFacilityScope | null> {
  const userId = (req as AuthenticatedRequest).userId;
  const requested = typeof req.query.facilityId === "string" ? req.query.facilityId : undefined;

  const scope = resolveRequestedFacilityScope(requested, await accessibleFacilityIds(userId));
  if (scope.kind !== "forbidden") return scope;


  // Best-effort audit write: a logging failure must never turn a correct 403 into a 500.
  await auditService.recordEvent({
    actorId: userId, action: "ACCESS_DENIED", resource, result: "DENIED", ip: req.ip,
  }).catch(() => {});
  res.status(403).json({ error: "Forbidden: facility outside your scope" });
  return null;
}
