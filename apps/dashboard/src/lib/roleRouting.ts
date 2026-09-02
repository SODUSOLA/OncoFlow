// Maps a role_name (apps/api/src/db/enums.ts roleNameEnum) to its dashboard path slug
// (apps/dashboard/src/App.tsx's roles array). All four CONSULTING_* specialties share one
// view, per the earlier product decision that consultant roles differ only in display/matching,
// not access — same reasoning as the backend's shared permission grant for them.
// PATIENT is deliberately absent. This is the staff console; a patient account has no page
// here, and mapping it to one is what let a patient session walk straight in — see
// hasStaffAccess() below.
const ROLE_TO_PATH: Record<string, string> = {
  REGIONAL_ADMIN: "regional-admin",
  VIRTUAL_MEDICAL_OFFICER: "virtual-medical-officer",
  CONSULTING_ONCOLOGIST: "consulting-oncologist",
  CONSULTING_SURGEON: "consulting-oncologist",
  CONSULTING_NUTRITIONIST: "consulting-oncologist",
  CONSULTING_PSYCHO_ONCOLOGIST: "consulting-oncologist",
  STATE_CLINICAL_DIRECTOR: "state-clinical-director",
  QUALITY_ASSURANCE_OFFICER: "quality-assurance-officer",
  ONSITE_NURSING_OFFICER: "onsite-nursing-officer",
  STATE_DIRECTOR_OF_NURSING_SERVICES: "state-director-of-nursing-services",
  SUPER_ADMIN: "super-admin",
  // NATIONAL_CLINICAL_DIRECTOR, NATIONAL_DIRECTOR_OF_NURSING_SERVICES, and SCRIBE have no
  // dashboard page yet — dashboardPathForRoles() returns null for a user with only these,
  // and the caller shows a "no dashboard yet" state instead of routing into a 404.
};

export function dashboardPathForRoles(roleNames: string[]): string | null {
  for (const name of roleNames) {
    const path = ROLE_TO_PATH[name];
    if (path) return path;
  }
  return null;
}

// Whether an account may enter the staff console at all — a separate question from which page
// it lands on. dashboardPathForRoles() returns null both for a staff role with no page built
// yet (NATIONAL_*, SCRIBE) and for an account with no staff standing whatsoever; the first
// should see "no dashboard yet", the second should never get past the login screen.
//
// Written as an exclusion rather than a list of staff roles so that a role added to
// roleNameEnum later counts as staff by default, instead of silently being denied access.
// Same shape, and the same reasoning, as MFA_OPTIONAL_ROLES in the API's lib/mfa-policy.ts.
const NON_STAFF_ROLES = new Set(["PATIENT"]);

// An account with no roles at all is not staff: it cannot reach anything here, and admitting it
// into the shell only produces a chrome-without-data screen.
export function hasStaffAccess(roleNames: string[]): boolean {
  return roleNames.some((name) => !NON_STAFF_ROLES.has(name));
}
