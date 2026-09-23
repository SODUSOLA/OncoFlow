import { Router } from "express";
import { z } from "zod";
import {
  startCaseHandler, getCaseHandler, listMyCasesHandler, listPendingReviewHandler,
  submitDocumentationSheetHandler, reportSecurityIncidentHandler, listSecurityIncidentsHandler, reviewCaseHandler,
} from "./controller.js";
import { requireAuthenticated, requirePermission, requireRole } from "../../lib/rbac.js";
import { validateBody, validateParams } from "../../lib/validation.js";
import { nursingCaseReviewDecisionEnum } from "../../db/enums.js";

const startCaseSchema = z.object({
  patientId: z.string().uuid(),
  regimenCycleId: z.string().uuid(),
});
const caseIdParamSchema = z.object({ id: z.string().uuid() });
const submitSheetSchema = z.object({
  upiCodeEntered: z.string().trim().min(1).max(100),
  idPhotoFileId: z.string().uuid(),
  fileReference: z.string().uuid(),
});
const reportIncidentSchema = z.object({
  fileId: z.string().uuid(),
  nursingCaseId: z.string().uuid().optional(),
});
const reviewSchema = z.object({
  decision: z.enum(nursingCaseReviewDecisionEnum.enumValues),
  reason: z.string().trim().max(2000).optional(),
});

const router = Router();

// Starts a nursing case (requires nursingCase:create).
router.post("/nursing-cases", requirePermission("nursingCase", "create"), validateBody(startCaseSchema), startCaseHandler);
// Lists the caller's own cases.
router.get("/nursing-cases/mine", requireAuthenticated(), listMyCasesHandler);
// Must precede /nursing-cases/:id so the static path isn't swallowed by the param route.
router.get("/nursing-cases/pending-review", requirePermission("nursingCase", "update"), requireRole("QUALITY_ASSURANCE_OFFICER"), listPendingReviewHandler);
// Reads one case (own for the nurse, permission for QA).
router.get("/nursing-cases/:id", requireAuthenticated(), validateParams(caseIdParamSchema), getCaseHandler);
// Submits the documentation sheet for a case.
router.post(
  "/nursing-cases/:id/documentation-sheet",
  requireAuthenticated(),
  validateParams(caseIdParamSchema),
  validateBody(submitSheetSchema),
  submitDocumentationSheetHandler,
);
// QA reviews a case.
router.post(
  "/nursing-cases/:id/review",
  requirePermission("nursingCase", "update"),
  requireRole("QUALITY_ASSURANCE_OFFICER"),
  validateParams(caseIdParamSchema),
  validateBody(reviewSchema),
  reviewCaseHandler,
);

// Records a security incident for an infected upload.
router.post("/security-incidents", requireAuthenticated(), validateBody(reportIncidentSchema), reportSecurityIncidentHandler);
// Lists recent security incidents for Regional Admin.
router.get("/security-incidents", requirePermission("securityIncident", "read"), listSecurityIncidentsHandler);

export { router as nursingRoutes };
