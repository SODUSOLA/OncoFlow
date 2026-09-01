import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { userHasRole } from "./rbac.js";

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
