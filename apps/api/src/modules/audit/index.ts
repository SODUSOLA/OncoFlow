export { auditService, AuditService } from "./service.js";
export { AuditRepository, type AuditAction, type AuditResult } from "./repository.js";

// Routes are not re-exported because routes → controller → facility-scope → this index would form a circular import; app.ts imports ./modules/audit/routes.js directly.

