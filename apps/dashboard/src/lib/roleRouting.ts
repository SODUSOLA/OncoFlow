// Maps a role_name (apps/api/src/db/enums.ts roleNameEnum) to its dashboard path slug
// (apps/dashboard/src/App.tsx's roles array). All four CONSULTING_* specialties share one
// view, per the earlier product decision that consultant roles differ only in display/matching,
// not access — same reasoning as the backend's shared permission grant for them.
const ROLE_TO_PATH: Record<string, string> = {
  PATIENT: "patient",
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
