import { Router } from "express";
import {
  startConversationHandler, getConversationHandler, listConversationsHandler,
  postMessageHandler, listMessagesHandler, closeConversationHandler,
  provisionMeetingHandler, getMeetingHandler,
  dailyMeetingStatusWebhookHandler, dailyTranscriptionWebhookHandler,
  listTranscriptHandler, editTranscriptEntryHandler, signOffTranscriptHandler,
  listTranscriptionQueueHandler, listMyTranscriptionAssignmentsHandler,
  claimTranscriptionAssignmentHandler, releaseTranscriptionAssignmentHandler,
  finalizeTranscriptionAssignmentHandler,
} from "./controller.js";
import { requirePermission, requireRole } from "../../lib/rbac.js";
import { validateBody, validateParams, validateQuery } from "../../lib/validation.js";
import { conversationTypeEnum, messageTypeEnum } from "../../db/enums.js";
import { z } from "zod";

const conversationIdParamSchema = z.object({
  id: z.string().uuid(),
});

const startConversationSchema = z.object({
  patientId: z.string().uuid(),
  conversationType: z.enum(conversationTypeEnum.enumValues),
  assignedTo: z.string().uuid().optional(),
});

const listConversationsQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
}).refine((value) => Boolean(value.patientId || value.assignedTo), {
  message: "Provide patientId or assignedTo",
});

const postMessageSchema = z.object({
  senderId: z.string().uuid(),
  type: z.enum(messageTypeEnum.enumValues),
  content: z.string().trim().min(1).max(4000),
});

const provisionMeetingSchema = z.object({
  appointmentId: z.string().uuid(),
});

const meetingQuerySchema = z.object({
  appointmentId: z.string().uuid(),
});

const meetingIdParamSchema = z.object({
  meetingId: z.string().uuid(),
});

const transcriptIdParamSchema = z.object({
  id: z.string().uuid(),
});

const editTranscriptSchema = z.object({
  content: z.string().trim().min(1).max(8000),
});

const transcriptionAssignmentIdParamSchema = z.object({
  id: z.string().uuid(),
});

const router = Router();

router.post("/conversations", requirePermission("conversation", "create"), validateBody(startConversationSchema), startConversationHandler);
router.get("/conversations", requirePermission("conversation", "read"), validateQuery(listConversationsQuerySchema), listConversationsHandler);
router.get("/conversations/:id", requirePermission("conversation", "read"), validateParams(conversationIdParamSchema), getConversationHandler);
router.post("/conversations/:id/close", requirePermission("conversation", "update"), validateParams(conversationIdParamSchema), closeConversationHandler);
router.post("/conversations/:id/messages", requirePermission("message", "create"), validateParams(conversationIdParamSchema), validateBody(postMessageSchema), postMessageHandler);
router.get("/conversations/:id/messages", requirePermission("message", "read"), validateParams(conversationIdParamSchema), listMessagesHandler);

router.post("/meetings", requirePermission("meeting", "create"), validateBody(provisionMeetingSchema), provisionMeetingHandler);
router.get("/meetings", requirePermission("meeting", "read"), validateQuery(meetingQuerySchema), getMeetingHandler);
router.get("/meetings/:meetingId/transcript", requirePermission("transcript", "read"), validateParams(meetingIdParamSchema), listTranscriptHandler);
// F3.11: editing transcript content is the Scribe's job specifically — requireRole enforces
// the specific role on top of requirePermission's generic resource:action grant, same pattern
// as F3.2's triage-checklist route.
router.patch(
  "/transcript/:id",
  requirePermission("transcript", "update"),
  requireRole("SCRIBE"),
  validateParams(transcriptIdParamSchema),
  validateBody(editTranscriptSchema),
  editTranscriptEntryHandler,
);

// F3.11 stage 2: no requireRole — "the respective consultant" is an ownership check (the
// appointment's own assigned oncologist) done in the service, not a role class.
router.post(
  "/meetings/:meetingId/sign-off",
  requirePermission("meeting", "update"),
  validateParams(meetingIdParamSchema),
  signOffTranscriptHandler,
);

router.get("/transcription-assignments/queue", requirePermission("transcriptionAssignment", "read"), requireRole("SCRIBE"), listTranscriptionQueueHandler);
router.get("/transcription-assignments/mine", requirePermission("transcriptionAssignment", "read"), requireRole("SCRIBE"), listMyTranscriptionAssignmentsHandler);
router.post(
  "/transcription-assignments/:id/claim",
  requirePermission("transcriptionAssignment", "claim"),
  requireRole("SCRIBE"),
  validateParams(transcriptionAssignmentIdParamSchema),
  claimTranscriptionAssignmentHandler,
);
router.post(
  "/transcription-assignments/:id/release",
  requirePermission("transcriptionAssignment", "update"),
  requireRole("SCRIBE"),
  validateParams(transcriptionAssignmentIdParamSchema),
  releaseTranscriptionAssignmentHandler,
);
router.post(
  "/transcription-assignments/:id/finalize",
  requirePermission("transcriptionAssignment", "update"),
  requireRole("SCRIBE"),
  validateParams(transcriptionAssignmentIdParamSchema),
  finalizeTranscriptionAssignmentHandler,
);

// Daily.co calls these directly — no OncoFlow session cookie, so no requirePermission/requireRole
// guard applies. Authenticity is verified inside the handler via requireVerifiedDailyWebhook()
// (HMAC signature over the raw body), not by session-based RBAC.
// public
router.post("/daily/webhooks/meeting-status", dailyMeetingStatusWebhookHandler);
// public
router.post("/daily/webhooks/transcription", dailyTranscriptionWebhookHandler);

export { router as messagingRoutes };
