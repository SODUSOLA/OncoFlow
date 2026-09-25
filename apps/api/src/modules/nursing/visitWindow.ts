import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { userHasRole } from "../../lib/rbac.js";

// An onsite nursing officer may read a patient only around the patient's visit: the patient belongs to the
// officer's facility AND has a regimen cycle scheduled within [today - 1, today + 1] (Lagos calendar day),
// or the officer already has an unclosed case with them (so a visit in progress is never cut off mid-way).
// Other roles are unaffected. Schema/db-only imports, like reviewerScope.ts, so patient, documents and
// clinical-metrics code can share it without a module cycle.
export const VISIT_WINDOW_DAYS = 1;

export const OUTSIDE_VISIT_WINDOW_MESSAGE =
  "This patient is not scheduled at your facility within the visit window (yesterday to tomorrow)";

// Ids of the patients this officer may currently read (their facility, in the window or mid-visit).
export async function nurseVisiblePatientIds(userId: string): Promise<Set<string>> {
  const rows = await db.execute<{ id: string }>(sql`
    SELECT p.id FROM patient p
    WHERE p.facility_id IS NOT NULL
      AND p.facility_id = (SELECT facility_id FROM "user" WHERE id = ${userId})
      AND (
        EXISTS (
          SELECT 1 FROM regimen_cycle rc JOIN regimen r ON r.id = rc.regimen_id
          WHERE r.patient_id = p.id AND rc.is_deleted = false AND r.is_deleted = false
            AND rc.scheduled_date BETWEEN ((now() AT TIME ZONE 'Africa/Lagos')::date - ${VISIT_WINDOW_DAYS}::int)
                                      AND ((now() AT TIME ZONE 'Africa/Lagos')::date + ${VISIT_WINDOW_DAYS}::int)
        )
        OR EXISTS (
          SELECT 1 FROM nursing_case c
          WHERE c.patient_id = p.id AND c.started_by = ${userId} AND c.status <> 'CLOSED' AND c.deleted_at IS NULL
        )
      )
  `);
  return new Set(rows.map((r) => r.id));
}

// True when the caller isn't a nursing officer (no restriction), or is one and the patient is in their window.
export async function nurseMayReadPatient(userId: string, patientId: string): Promise<boolean> {
  if (!(await userHasRole(userId, "ONSITE_NURSING_OFFICER"))) return true;
  return (await nurseVisiblePatientIds(userId)).has(patientId);
}

// The Lagos calendar day `offset` days from today, as YYYY-MM-DD (matches the SQL window above).
export function lagosDayOffset(offset: number): string {
  const d = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
