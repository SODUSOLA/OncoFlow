export { auditService, AuditService } from "./service.js";
export { AuditRepository, type AuditAction, type AuditResult } from "./repository.js";

// `auditRoutes` is deliberately NOT re-exported here. This file (service.js/repository.js) is
// imported by lib/facility-scope.js and lib/rbac.js to write ACCESS_DENIED rows; routes.js's own
// controller imports accessibleFacilityIds FROM facility-scope.js to region-scope this feed. If
// auditRoutes were exported from here too, importing this file would pull in routes -> controller
// -> facility-scope -> back to this file, a real circular import. app.ts imports auditRoutes
// directly from "./modules/audit/routes.js" instead, which every other route module doesn't need
// to bother with because none of them sit on both ends of that dependency.

