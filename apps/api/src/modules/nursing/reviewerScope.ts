import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { userHasRole } from "../../lib/rbac.js";

// A QA officer is registered to one facility and reviews only that facility's cases. Returns that facility's
// id, or null when the caller isn't facility-bound (SUPER_ADMIN, or an account with no facility).
// Schema/db-only imports beyond rbac, so drug-supply and patient code can share it without a module cycle.
export async function reviewerFacilityId(userId: string): Promise<string | null> {
  if (await userHasRole(userId, "SUPER_ADMIN")) return null;
  const rows = await db.execute<{ facility_id: string | null }>(sql`SELECT facility_id FROM "user" WHERE id = ${userId} LIMIT 1`);
  return rows[0]?.facility_id ?? null;
}

// Whether a reviewer may see/act on a case whose patient belongs to this facility.
export async function reviewerMayAccess(userId: string, patientFacilityId: string): Promise<boolean> {
  const own = await reviewerFacilityId(userId);
  return own === null || own === patientFacilityId;
}

export const OUT_OF_SCOPE_MESSAGE = "This case belongs to a different facility";
