import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { config } from "../config.js";

// Only PATIENT may skip MFA; expressed as an opt-out set so any newly added role requires MFA by default.
const MFA_OPTIONAL_ROLES: ReadonlySet<string> = new Set(["PATIENT"]);

// True when the user holds at least one role outside the opt-out set; users with no roles return false.
async function holdsStaffRole(userId: string): Promise<boolean> {
  const optional = [...MFA_OPTIONAL_ROLES];
  // Builds the role exclusion with individual sql.join parameters because drizzle binds a JS array as a string Postgres rejects for `<> ALL(...)`.
  const exclusion = optional.length > 0
    ? sql` AND r.name::text NOT IN (${sql.join(optional.map((r) => sql`${r}`), sql`, `)})`
    : sql``;
  const rows = await db.execute<{ matched: boolean }>(sql`
    SELECT EXISTS(
      SELECT 1
      FROM user_role ur
      JOIN role r ON r.id = ur.role_id
      WHERE ur.user_id = ${userId}${exclusion}
    ) AS matched
  `);
  return Boolean(rows[0]?.matched);
}

export interface MfaRequirement {
  // Must this session pass an MFA check before touching gated routes?
  required: boolean;
  // Has the user confirmed a TOTP secret (completed enrolment)?
  enrolled: boolean;
  // Required but not yet enrolled — the client must send the user through /auth/mfa/enroll.
  enrollmentPending: boolean;
}

// Single source of truth for whether MFA applies: voluntary enrolment, or staff policy when config.mfaEnforceStaff is on.
export async function resolveMfaRequirement(
  userId: string,
  mfaEnabled: boolean,
): Promise<MfaRequirement> {
  if (mfaEnabled) {
    return { required: true, enrolled: true, enrollmentPending: false };
  }
  const policyRequires = config.mfaEnforceStaff && (await holdsStaffRole(userId));
  return {
    required: policyRequires,
    enrolled: false,
    enrollmentPending: policyRequires,
  };
}
