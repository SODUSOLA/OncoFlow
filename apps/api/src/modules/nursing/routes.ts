import { Router } from "express";
import { z } from "zod";
import {
  startCaseHandler, getCaseHandler, listMyCasesHandler, listCasesByPatientHandler, listPendingReviewHandler,
  submitDocumentationSheetHandler, reportSecurityIncidentHandler, listSecurityIncidentsHandler, reviewCaseHandler, verifyIdentityHandler, reportMismatchHandler,
  startInfusionHandler, endInfusionHandler, listLiveBoardHandler,
} from "./controller.js";
import { requireAuthenticated, requirePermission, requireRole } from "../../lib/rbac.js";
import { validateBody, validateParams, validateQuery } from "../../lib/validation.js";
import { nursingCaseReviewDecisionEnum } from "../../db/enums.js";

const startCaseSchema = z.object({
  patientId: z.string().uuid(),
  regimenCycleId: z.string().uuid(),
});
const caseIdParamSchema = z.object({ id: z.string().uuid() });
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const submitSheetSchema = z.object({
  // Legacy free-form upload from before the structured form; no current caller sends this.
  fileReference: z.string().uuid().optional(),
  // diagnosis and managingConsultant are deliberately not accepted here — both are resolved server-side
  // (from the cycle's regimen and the patient's facility's QA officer; see nursing/service.ts), not typed
  // by the nurse.
  // Required: the sheet is the record of the treatment and the date anchors it.
  treatmentDate: dateString,
  note: z.string().trim().max(4000).optional(),
  nextAppointmentDate: dateString.optional(),
});
const reportIncidentSchema = z.object({
  fileId: z.string().uuid(),
  nursingCaseId: z.string().uuid().optional(),
});
const reviewSchema = z.object({
  decision: z.enum(nursingCaseReviewDecisionEnum.enumValues),
  reason: z.string().trim().max(2000).optional(),
});
const listByPatientQuerySchema = z.object({
  patientId: z.string().uuid(),
});

const router = Router();

// Starts a nursing case (requires nursingCase:create).
router.post("/nursing-cases", requirePermission("nursingCase", "create"), validateBody(startCaseSchema), startCaseHandler);
// Lists the caller's own cases.
router.get("/nursing-cases/mine", requireAuthenticated(), listMyCasesHandler);
// The patient folder's case history — every case on record for this patient, open to anyone with
// legitimate clinical access to the patient (patient:read), not just whoever started a given case.
router.get("/nursing-cases", requirePermission("patient", "read"), validateQuery(listByPatientQuerySchema), listCasesByPatientHandler);
// Must precede /nursing-cases/:id so the static path isn't swallowed by the param route.
router.get("/nursing-cases/pending-review", requirePermission("nursingCase", "update"), requireRole("QUALITY_ASSURANCE_OFFICER"), listPendingReviewHandler);
// Regional Admin's live board of running cases. Static path, so it precedes /nursing-cases/:id.
router.get("/nursing-cases/live", requirePermission("nursingCase", "read"), listLiveBoardHandler);
// Reads one case (own for the nurse, permission for QA).
router.get("/nursing-cases/:id", requireAuthenticated(), validateParams(caseIdParamSchema), getCaseHandler);
// Confirms the patient's identity on a case (owner only).
router.post("/nursing-cases/:id/verify-identity", requireAuthenticated(), validateParams(caseIdParamSchema), verifyIdentityHandler);
// The nurse's live Start / End Infusion buttons (owner only; times are stamped server-side).
router.post("/nursing-cases/:id/infusion/start", requireAuthenticated(), validateParams(caseIdParamSchema), startInfusionHandler);
router.post("/nursing-cases/:id/infusion/end", requireAuthenticated(), validateParams(caseIdParamSchema), endInfusionHandler);
// Reports that the patient doesn't match their profile (owner only); recorded and sent to Regional Admin.
router.post(
  "/nursing-cases/:id/report-mismatch", requireAuthenticated(), validateParams(caseIdParamSchema),
  validateBody(z.object({ note: z.string().trim().max(1000).optional() })), reportMismatchHandler,
);
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
