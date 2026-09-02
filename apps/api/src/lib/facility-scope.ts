import type { Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { userHasRole, type AuthenticatedRequest } from "./rbac.js";
// Same cross-module coupling as rbac.ts: an access-denied decision must leave an audit row,
// and this is one of the places that decision is made.
import { auditService } from "../modules/audit/index.js";

// Resolves which facilities a caller is allowed to see, server-side.
//
// Why this exists: every staff-facing list endpoint used to take `?facilityId` straight from
// the query string and filter by it, with no check that the caller belonged to that facility —
// so Hospital A staff could read Hospital B's patients by changing one ID, and `?facilityId=all`
// returned every patient on the platform. `requirePermissionScoped` existed in rbac.ts but was
// wired to zero routes.
//
// The rule encoded here follows 21-regional-admin-scope-definition.md: a facility-scoped user is
// scoped to their REGION (every facility sharing their own facility's `region`), not to a single
// facility — that doc's whole point is that a Regional Admin legitimately covers several
// facilities. `User.region` was recommended there but never added, so region is derived from the
// caller's own facility, which is already populated for every facility-scoped staff account.
//
// Returns `null` for unrestricted access. That's SUPER_ADMIN, plus accounts with no facilityId
// at all — the national-level roles (National Clinical Director, National Director of Nursing
// Services) whose remit is cross-region by definition (see seed/demo-users.ts facilityScoped:false).
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

// Narrows a requested `?facilityId` against what the caller may actually see.
//
// Two separate concerns are deliberately kept apart here:
//   * authorization — may this caller see that facility at all?
//   * filtering — which facility did they ask to narrow the list to?
// An unrestricted caller still gets their explicit `?facilityId` honoured as a *filter*;
// dropping it would silently widen the result set and break facility filtering for
// SUPER_ADMIN and national roles.
//
// - explicit id the caller may not see: `forbidden`, so the caller can 403 rather than return
//   a confusingly empty list.
// - `"all"` / omitted: the caller's own accessible facilities, or unrestricted if they have none.
export type FacilityScopeResolution =
  | { kind: "unrestricted" }
  | { kind: "forbidden" }
  | { kind: "restricted"; facilityIds: string[] };

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

// Controller-side wrapper: reads `?facilityId`, narrows it against the caller's real scope, and
// on refusal writes the audit row and sends the 403 itself, returning null so the handler just
// returns. Exists because the alternative — repeating twenty lines of scope-resolve-audit-403 in
// every list handler that accepts `?facilityId` — is exactly how one of them ends up subtly
// different from the others, which is the bug class this whole module exists to close.
// The `forbidden` case never escapes — it is turned into a 403 here — so it is excluded from
// the return type. That lets callers narrow on `kind` without TypeScript still believing a
// forbidden result could reach them.
export type AllowedFacilityScope = Exclude<FacilityScopeResolution, { kind: "forbidden" }>;

export async function resolveScopeOrDeny(
  req: Request,
  res: Response,
  resource: string,
): Promise<AllowedFacilityScope | null> {
  const userId = (req as AuthenticatedRequest).userId;
  const requested = typeof req.query.facilityId === "string" ? req.query.facilityId : undefined;

  const scope = resolveRequestedFacilityScope(requested, await accessibleFacilityIds(userId));
  if (scope.kind !== "forbidden") return scope;


  // Best-effort, same tolerance as rbac.ts's own audit calls — a logging failure must never
  // turn a correct 403 into a 500.
  await auditService.recordEvent({
    actorId: userId, action: "ACCESS_DENIED", resource, result: "DENIED", ip: req.ip,
  }).catch(() => {});
  res.status(403).json({ error: "Forbidden: facility outside your scope" });
  return null;
}
