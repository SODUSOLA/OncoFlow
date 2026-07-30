import { Router } from "express";
import {
  listCountdownCasesHandler, completeTriageChecklistHandler, getTriageChecklistHandler,
  createPrescriptionHandler, listPrescriptionsHandler,
  createLabRequestHandler, getLabRequestHandler, listLabRequestsHandler,
  markLabRequestUploadedHandler, markLabRequestReviewedHandler,
  uploadLabResultHandler, getLabResultHandler, listLabResultsHandler,
  recordQaRecommendationHandler, recordFinalDecisionHandler, getClinicalDecisionHandler, sendResultsToQaHandler,
} from "./controller.js";
import { requirePermission, requireRole } from "../../lib/rbac.js";
import { validateBody, validateParams, validateQuery } from "../../lib/validation.js";
import { z } from "zod";

const conversationIdParamSchema = z.object({
  conversationId: z.string().uuid(),
});

const completeTriageChecklistSchema = z.object({
  conversationId: z.string().uuid(),
  presentingComplaint: z.string().trim().min(1).max(2000),
  duration: z.string().trim().min(1).max(100),
  functionalImpact: z.string().trim().min(1).max(2000),
  priorMeasures: z.string().trim().min(1).max(2000),
  canTalkWalkEat: z.string().trim().min(1).max(2000),
});

const createPrescriptionSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  triageChecklistId: z.string().uuid().optional(),
});

const listPrescriptionsQuerySchema = z.object({
  patientId: z.string().uuid(),
});

const labRequestIdParamSchema = z.object({
  id: z.string().uuid(),
});

const createLabRequestSchema = z.object({
  patientId: z.string().uuid(),
});

const listLabRequestsQuerySchema = z.object({
  patientId: z.string().uuid(),
});

const labResultIdParamSchema = z.object({
  id: z.string().uuid(),
});

const uploadLabResultSchema = z.object({
  patientId: z.string().uuid(),
  requestId: z.string().uuid(),
  fileId: z.string().uuid(),
  testDate: z.string().trim().min(1).max(32),
  fileHash: z.string().trim().min(1).max(128),
});

const listLabResultsQuerySchema = z.object({
  patientId: z.string().uuid(),
});

const clinicalDecisionIdParamSchema = z.object({
  id: z.string().uuid(),
});

const decisionValues = ["APPROVED", "DECLINED", "REQUIRES_REVIEW"] as const;

const recordQaRecommendationSchema = z.object({
  recommendation: z.enum(decisionValues),
  reason: z.string().trim().min(1).max(2000).optional(),
});

const recordFinalDecisionSchema = z.object({
  decision: z.enum(decisionValues),
  reason: z.string().trim().min(1).max(2000).optional(),
});

const sendResultsToQaSchema = z.object({
  countdownCaseId: z.string().uuid(),
  labResultId: z.string().uuid(),
});

const router = Router();

router.get("/countdown-cases", requirePermission("countdownCase", "read"), listCountdownCasesHandler);

// F3.2: only a Virtual Medical Officer can complete a triage checklist — requireRole enforces
// the specific role on top of requirePermission's generic resource:action grant.
router.post(
  "/triage-checklists",
  requirePermission("triageChecklist", "create"),
  requireRole("VIRTUAL_MEDICAL_OFFICER"),
  validateBody(completeTriageChecklistSchema),
  completeTriageChecklistHandler,
);
router.get(
  "/triage-checklists/:conversationId",
  requirePermission("triageChecklist", "read"),
  validateParams(conversationIdParamSchema),
  getTriageChecklistHandler,
);

// F3.3: no requireRole here — MO and Consulting Oncologist (and other consultant roles) can
// all legitimately prescribe; the MO-specific triage requirement is conditional and lives in
// PrescriptionService.assertTriageRequiredIfMO(), not a blanket route-level role restriction.
router.post(
  "/prescriptions",
  requirePermission("prescription", "create"),
  validateBody(createPrescriptionSchema),
  createPrescriptionHandler,
);
router.get(
  "/prescriptions",
  requirePermission("prescription", "read"),
  validateQuery(listPrescriptionsQuerySchema),
  listPrescriptionsHandler,
);

router.post(
  "/lab-requests",
  requirePermission("labRequest", "create"),
  validateBody(createLabRequestSchema),
  createLabRequestHandler,
);
router.get(
  "/lab-requests",
  requirePermission("labRequest", "read"),
  validateQuery(listLabRequestsQuerySchema),
  listLabRequestsHandler,
);
router.get(
  "/lab-requests/:id",
  requirePermission("labRequest", "read"),
  validateParams(labRequestIdParamSchema),
  getLabRequestHandler,
);
router.post(
  "/lab-requests/:id/mark-uploaded",
  requirePermission("labRequest", "update"),
  validateParams(labRequestIdParamSchema),
  markLabRequestUploadedHandler,
);
router.post(
  "/lab-requests/:id/mark-reviewed",
  requirePermission("labRequest", "update"),
  validateParams(labRequestIdParamSchema),
  markLabRequestReviewedHandler,
);

router.post(
  "/lab-results",
  requirePermission("labResult", "create"),
  validateBody(uploadLabResultSchema),
  uploadLabResultHandler,
);
router.get(
  "/lab-results",
  requirePermission("labResult", "read"),
  validateQuery(listLabResultsQuerySchema),
  listLabResultsHandler,
);
router.get(
  "/lab-results/:id",
  requirePermission("labResult", "read"),
  validateParams(labResultIdParamSchema),
  getLabResultHandler,
);

// F3.6: sending results to QA is what creates the ClinicalDecision row a QA officer then
// acts on — gated on the same countdownCase permission since it's a countdown-case transition.
router.post(
  "/countdown-cases/send-results-to-qa",
  requirePermission("countdownCase", "update"),
  validateBody(sendResultsToQaSchema),
  sendResultsToQaHandler,
);

router.get(
  "/clinical-decisions/:id",
  requirePermission("clinicalDecision", "read"),
  validateParams(clinicalDecisionIdParamSchema),
  getClinicalDecisionHandler,
);
// Stage 1: Quality Assurance Officer only.
router.post(
  "/clinical-decisions/:id/qa-recommendation",
  requirePermission("clinicalDecision", "update"),
  requireRole("QUALITY_ASSURANCE_OFFICER"),
  validateParams(clinicalDecisionIdParamSchema),
  validateBody(recordQaRecommendationSchema),
  recordQaRecommendationHandler,
);
// Stage 2: State Clinical Director only — the sequencing guard itself lives in the entity,
// this is just who's allowed to attempt it at all.
router.post(
  "/clinical-decisions/:id/final-decision",
  requirePermission("clinicalDecision", "update"),
  requireRole("STATE_CLINICAL_DIRECTOR"),
  validateParams(clinicalDecisionIdParamSchema),
  validateBody(recordFinalDecisionSchema),
  recordFinalDecisionHandler,
);

export { router as clinicalRoutes };
