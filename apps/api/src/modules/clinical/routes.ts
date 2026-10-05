import { Router } from "express";
import {
  listCountdownCasesHandler, escalateCountdownCaseHandler, completeTriageChecklistHandler, getTriageChecklistHandler,
  createPrescriptionHandler, listPrescriptionsHandler,
  createLabRequestHandler, getLabRequestHandler, listLabRequestsHandler,
  markLabRequestUploadedHandler, markLabRequestReviewedHandler,
  uploadLabResultHandler, getLabResultHandler, listLabResultsHandler,
  recordQaRecommendationHandler, recordFinalDecisionHandler, getClinicalDecisionHandler, sendResultsToQaHandler,
  createClinicalNoteHandler, listClinicalNotesHandler, getClinicalNoteByMeetingHandler,
} from "./controller.js";
import { requirePermission, requireRole, requireAuthenticated } from "../../lib/rbac.js";
import { validateBody, validateParams, validateQuery } from "../../lib/validation.js";
import { z } from "zod";

const conversationIdParamSchema = z.object({
  conversationId: z.string().uuid(),
});

const listCountdownCasesQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  // Defaults to the narrow ACTIVE set existing callers expect; the admin board opts into ACTIVE+ESCALATED with ?scope=overview.
  scope: z.enum(["active", "overview"]).optional(),
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

// Authenticated because ?patientId= is a patient's own-status read; without it the staff-wide listing is permission-checked in the handler.
router.get("/countdown-cases", requireAuthenticated(), validateQuery(listCountdownCasesQuerySchema), listCountdownCasesHandler);

// Regional Admin's manual nudge to QA; countdownCase:read suffices because it changes no case state, and the controller enforces facility scope.
router.post(
  "/countdown-cases/:id/escalate",
  requirePermission("countdownCase", "read"),
  requireRole("REGIONAL_ADMIN"),
  validateParams(z.object({ id: z.string().uuid() })),
  escalateCountdownCaseHandler,
);

// F3.2: only a Virtual Medical Officer can complete a triage checklist, enforced by requireRole on top of the permission.
router.post(
  "/triage-checklists",
  requirePermission("triageChecklist", "create"),
  requireRole("VIRTUAL_MEDICAL_OFFICER"),
  validateBody(completeTriageChecklistSchema),
  completeTriageChecklistHandler,
);
// Reads a conversation's triage checklist.
router.get(
  "/triage-checklists/:conversationId",
  requirePermission("triageChecklist", "read"),
  validateParams(conversationIdParamSchema),
  getTriageChecklistHandler,
);

// No requireRole: several roles can prescribe, and the MO-specific triage requirement is enforced in PrescriptionService.
router.post(
  "/prescriptions",
  requirePermission("prescription", "create"),
  validateBody(createPrescriptionSchema),
  createPrescriptionHandler,
);
// Lists prescriptions.
router.get(
  "/prescriptions",
  requirePermission("prescription", "read"),
  validateQuery(listPrescriptionsQuerySchema),
  listPrescriptionsHandler,
);

// Creates a lab request.
router.post(
  "/lab-requests",
  requirePermission("labRequest", "create"),
  validateBody(createLabRequestSchema),
  createLabRequestHandler,
);
// Patients may list their own lab requests (ownership check in the controller).
router.get(
  "/lab-requests",
  requireAuthenticated(),
  validateQuery(listLabRequestsQuerySchema),
  listLabRequestsHandler,
);
// Reads one lab request.
router.get(
  "/lab-requests/:id",
  requirePermission("labRequest", "read"),
  validateParams(labRequestIdParamSchema),
  getLabRequestHandler,
);
// Marks a lab request as uploaded.
router.post(
  "/lab-requests/:id/mark-uploaded",
  requirePermission("labRequest", "update"),
  validateParams(labRequestIdParamSchema),
  markLabRequestUploadedHandler,
);
// Marks a lab request as reviewed.
router.post(
  "/lab-requests/:id/mark-reviewed",
  requirePermission("labRequest", "update"),
  validateParams(labRequestIdParamSchema),
  markLabRequestReviewedHandler,
);

// Patients uploading their own lab result is a right; the ownership check is in the controller.
router.post(
  "/lab-results",
  requireAuthenticated(),
  validateBody(uploadLabResultSchema),
  uploadLabResultHandler,
);
// Patients reading their own lab results is a right; the ownership-or-permission check is in the controller.
router.get(
  "/lab-results",
  requireAuthenticated(),
  validateQuery(listLabResultsQuerySchema),
  listLabResultsHandler,
);
// Reads one lab result.
router.get(
  "/lab-results/:id",
  requireAuthenticated(),
  validateParams(labResultIdParamSchema),
  getLabResultHandler,
);

// Sending results to QA creates the ClinicalDecision a QA officer acts on, gated on the countdownCase permission.
router.post(
  "/countdown-cases/send-results-to-qa",
  requirePermission("countdownCase", "update"),
  validateBody(sendResultsToQaSchema),
  sendResultsToQaHandler,
);

// Reads one clinical decision.
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
// Stage 2 is State Clinical Director only; the sequencing guard itself lives in the entity.
router.post(
  "/clinical-decisions/:id/final-decision",
  requirePermission("clinicalDecision", "update"),
  requireRole("STATE_CLINICAL_DIRECTOR"),
  validateParams(clinicalDecisionIdParamSchema),
  validateBody(recordFinalDecisionSchema),
  recordFinalDecisionHandler,
);

const createClinicalNoteSchema = z.object({
  patientId: z.string().uuid(),
  note: z.string().trim().min(1).max(5000),
  // Only sent by "Sync to EHR & Finalize"; the plain Add Clinical Note action omits it and gets CONSULT_NOTE.
  recordType: z.enum(["CONSULT_NOTE", "POST_CALL_SUMMARY"]).optional(),
  sourceMeetingId: z.string().uuid().optional(),
});
const listClinicalNotesQuerySchema = z.object({
  patientId: z.string().uuid(),
});
const meetingIdParamSchema = z.object({
  meetingId: z.string().uuid(),
});

// Creates a clinical note.
router.post(
  "/clinical-notes",
  requirePermission("clinicalNote", "create"),
  validateBody(createClinicalNoteSchema),
  createClinicalNoteHandler,
);
// Lists clinical notes.
router.get(
  "/clinical-notes",
  requirePermission("clinicalNote", "read"),
  validateQuery(listClinicalNotesQuerySchema),
  listClinicalNotesHandler,
);
// Uses the same clinicalNote:read grant as the list route, since only staff use the Post-call Summary screen.
router.get(
  "/clinical-notes/by-meeting/:meetingId",
  requirePermission("clinicalNote", "read"),
  validateParams(meetingIdParamSchema),
  getClinicalNoteByMeetingHandler,
);

export { router as clinicalRoutes };
