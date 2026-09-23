// Maps each role to its dashboard path; consultant specialties share one view, and PATIENT is absent so a patient session can't enter the staff console.
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
  // These roles have no dashboard yet, so callers show a "no dashboard yet" state instead of a 404.
};

// Returns the dashboard path for the user's first role that has one, or null.
export function dashboardPathForRoles(roleNames: string[]): string | null {
  for (const name of roleNames) {
    const path = ROLE_TO_PATH[name];
    if (path) return path;
  }
  return null;
}

// Non-staff exclusion list, written as an exclusion so newly added roles count as staff by default (like the API's MFA_OPTIONAL_ROLES).
const NON_STAFF_ROLES = new Set(["PATIENT"]);

// An account with no roles isn't staff, since admitting it only shows an empty shell.
export function hasStaffAccess(roleNames: string[]): boolean {
  return roleNames.some((name) => !NON_STAFF_ROLES.has(name));
}
