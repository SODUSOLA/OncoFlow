import { Router } from "express";
import {
  listCountdownCasesHandler, completeTriageChecklistHandler, getTriageChecklistHandler,
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
  // Defaults to the narrow, day>0-only ACTIVE set every existing caller expects (see
  // CountdownCaseRepository.findActive's comment) — the admin overview board opts into the
  // wider ACTIVE+ESCALATED set explicitly with ?scope=overview rather than changing the default.
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

// requireAuthenticated: ?patientId= is a self-service "my own countdown status" read (Patient
// role); no patientId is the unchanged staff-wide listing, ownership-checked in the handler.
router.get("/countdown-cases", requireAuthenticated(), validateQuery(listCountdownCasesQuerySchema), listCountdownCasesHandler);

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
// requireAuthenticated: a patient listing their OWN lab requests (to know what to upload
// against) is a right, not a grant — see listLabRequestsHandler's callerOwnsPatient check.
router.get(
  "/lab-requests",
  requireAuthenticated(),
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

// requireAuthenticated: a patient uploading their OWN lab result is a right, not a grant —
// see uploadLabResultHandler's callerOwnsPatient check.
router.post(
  "/lab-results",
  requireAuthenticated(),
  validateBody(uploadLabResultSchema),
  uploadLabResultHandler,
);
// requireAuthenticated, not requirePermission: a patient reading their OWN lab results is a
// right, not a grant — the ownership-or-permission check lives in the controller (callerOwnsPatient).
router.get(
  "/lab-results",
  requireAuthenticated(),
  validateQuery(listLabResultsQuerySchema),
  listLabResultsHandler,
);
router.get(
  "/lab-results/:id",
  requireAuthenticated(),
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

const createClinicalNoteSchema = z.object({
  patientId: z.string().uuid(),
  note: z.string().trim().min(1).max(5000),
  // Only ever sent by Phase 6's "Sync to EHR & Finalize" — every other caller (the sidebar's
  // free-text "Add Clinical Note") omits both and gets the CONSULT_NOTE default.
  recordType: z.enum(["CONSULT_NOTE", "POST_CALL_SUMMARY"]).optional(),
  sourceMeetingId: z.string().uuid().optional(),
});
const listClinicalNotesQuerySchema = z.object({
  patientId: z.string().uuid(),
});
const meetingIdParamSchema = z.object({
  meetingId: z.string().uuid(),
});

router.post(
  "/clinical-notes",
  requirePermission("clinicalNote", "create"),
  validateBody(createClinicalNoteSchema),
  createClinicalNoteHandler,
);
router.get(
  "/clinical-notes",
  requirePermission("clinicalNote", "read"),
  validateQuery(listClinicalNotesQuerySchema),
  listClinicalNotesHandler,
);
// requirePermission("clinicalNote", "read") — same grant as the list route above; no separate
// ownership path since only staff with that grant use the Post-call Summary screen at all.
router.get(
  "/clinical-notes/by-meeting/:meetingId",
  requirePermission("clinicalNote", "read"),
  validateParams(meetingIdParamSchema),
  getClinicalNoteByMeetingHandler,
);

export { router as clinicalRoutes };
