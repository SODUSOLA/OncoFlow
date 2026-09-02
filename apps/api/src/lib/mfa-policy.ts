import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { config } from "../config.js";

// Which roles may opt out of MFA.
//
// PATIENT only. Every other role in roleNameEnum is staff with access to other people's PHI —
// a Regional Admin can read every patient in their region, a Consultant can read clinical
// notes, a Scribe can edit transcripts — so a stolen or reused password on any of them is a
// bulk-disclosure event, not a single-account one. A patient account reaches exactly one
// record (its own), and the product deliberately optimises that flow for low friction
// (see the registration rebuild), so TOTP stays opt-in there.
//
// Expressed as an opt-OUT set rather than a list of staff roles on purpose: when a new role is
// added to roleNameEnum, the safe default is that it requires MFA, without anyone remembering
// to update this file.
const MFA_OPTIONAL_ROLES: ReadonlySet<string> = new Set(["PATIENT"]);

// True when the user holds at least one role outside MFA_OPTIONAL_ROLES.
// A user with no roles at all returns false — they can't reach anything role-gated anyway,
// and locking out an unprovisioned account behind a second factor it cannot enrol helps nobody.
async function holdsStaffRole(userId: string): Promise<boolean> {
  const optional = [...MFA_OPTIONAL_ROLES];
  // Every role is staff — no exclusion clause to build, so any role at all counts.
  // Expanded as individual scalar parameters via sql.join rather than binding the array to
  // `<> ALL(...)`: drizzle sends a plain JS array as a bare string, which Postgres rejects
  // as a malformed array literal.
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

// The single source of truth for "does MFA apply to this user".
//
// Two independent reasons MFA can be required:
//   1. the user enrolled voluntarily (mfaEnabled) — applies to everyone, patients included;
//   2. policy: they hold a staff role and staff enforcement is switched on.
//
// (2) is behind config.mfaEnforceStaff because the staff dashboard has no enrolment screen
// yet. Flipping it on before that ships would leave every staff account able to log in but
// unable to enrol, and therefore blocked on every gated route — see docs note in config.ts.
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
