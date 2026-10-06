import { Router } from "express";
import {
  listAdminInquiriesHandler, listAdminInquiryMessagesHandler, adminInquiryAttachmentHandler, replyAdminInquiryHandler, closeAdminInquiryHandler,
  startConversationHandler, getConversationHandler, listConversationsHandler,
  postMessageHandler, listMessagesHandler, closeConversationHandler, startSideEffectReportHandler,
  submitFeedbackHandler, listFeedbackHandler,
  provisionMeetingHandler, getMeetingHandler, getMeetingPresenceHandler, issueMeetingTokenHandler, endMeetingHandler,
  dailyMeetingStatusWebhookHandler, dailyTranscriptionWebhookHandler, dailyRecordingWebhookHandler,
  listTranscriptHandler, editTranscriptEntryHandler, signOffTranscriptHandler,
  listTranscriptionQueueHandler, listMyTranscriptionAssignmentsHandler,
  claimTranscriptionAssignmentHandler, releaseTranscriptionAssignmentHandler,
  finalizeTranscriptionAssignmentHandler,
} from "./controller.js";
import { requirePermission, requireRole, requireAuthenticated } from "../../lib/rbac.js";
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
  // No senderId: the sender is always the authenticated caller, and a client still sending one fails validation.
  type: z.enum(messageTypeEnum.enumValues),
  content: z.string().trim().min(1).max(4000),
}).strict();

const startSideEffectReportSchema = z.object({
  patientId: z.string().uuid(),
  message: z.string().trim().min(1).max(4000),
});

const submitFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().trim().max(2000).optional(),
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

const adminInquiryReplySchema = z.object({ content: z.string().trim().min(1).max(4000) }).strict();
const adminInquiryListQuerySchema = z.object({ status: z.enum(["OPEN", "CLOSED"]).optional() });

const router = Router();

// Patient admin inquiries for a Regional Admin, scoped to their region by the handlers. These deliberately do not
// reuse conversation:read, which would expose every conversation (including side-effect chats) by id.
router.get("/admin/patient-inquiries", requirePermission("patientInquiry", "read"), requireRole("REGIONAL_ADMIN"), validateQuery(adminInquiryListQuerySchema), listAdminInquiriesHandler);
router.get("/admin/patient-inquiries/:id/messages", requirePermission("patientInquiry", "read"), requireRole("REGIONAL_ADMIN"), validateParams(conversationIdParamSchema), listAdminInquiryMessagesHandler);
router.get("/admin/patient-inquiries/:id/messages/:messageId/attachment", requirePermission("patientInquiry", "read"), requireRole("REGIONAL_ADMIN"), validateParams(z.object({ id: z.string().uuid(), messageId: z.string().uuid() })), adminInquiryAttachmentHandler);
router.post("/admin/patient-inquiries/:id/messages", requirePermission("patientInquiry", "update"), requireRole("REGIONAL_ADMIN"), validateParams(conversationIdParamSchema), validateBody(adminInquiryReplySchema), replyAdminInquiryHandler);
router.post("/admin/patient-inquiries/:id/close", requirePermission("patientInquiry", "update"), requireRole("REGIONAL_ADMIN"), validateParams(conversationIdParamSchema), closeAdminInquiryHandler);

// Authenticated only where a patient acting on their own record is legitimate; the ownership check is in the service.
router.post("/conversations", requireAuthenticated(), validateBody(startConversationSchema), startConversationHandler);
// The only path for a patient to start an MO_SIDE_EFFECT conversation, since it creates and pays the fee first.
router.post("/conversations/side-effect-report", requireAuthenticated(), validateBody(startSideEffectReportSchema), startSideEffectReportHandler);
// Lists the caller's conversations.
router.get("/conversations", requireAuthenticated(), validateQuery(listConversationsQuerySchema), listConversationsHandler);
// Reads one conversation.
router.get("/conversations/:id", requireAuthenticated(), validateParams(conversationIdParamSchema), getConversationHandler);
// A patient closes their own report or staff with conversation:update close one they handle; checked in the service.
router.post("/conversations/:id/close", requireAuthenticated(), validateParams(conversationIdParamSchema), closeConversationHandler);
// Posts a message as the caller.
router.post("/conversations/:id/messages", requireAuthenticated(), validateParams(conversationIdParamSchema), validateBody(postMessageSchema), postMessageHandler);
// Lists a conversation's messages.
router.get("/conversations/:id/messages", requireAuthenticated(), validateParams(conversationIdParamSchema), listMessagesHandler);
// Mutual rating, one per rater and only once the conversation is CLOSED, enforced in the service.
router.post("/conversations/:id/feedback", requireAuthenticated(), validateParams(conversationIdParamSchema), validateBody(submitFeedbackSchema), submitFeedbackHandler);
// Lists a conversation's feedback.
router.get("/conversations/:id/feedback", requireAuthenticated(), validateParams(conversationIdParamSchema), listFeedbackHandler);

// Provisions a meeting room for an appointment.
router.post("/meetings", requirePermission("meeting", "create"), validateBody(provisionMeetingSchema), provisionMeetingHandler);
// Reads the meeting for an appointment.
router.get("/meetings", requireAuthenticated(), validateQuery(meetingQuerySchema), getMeetingHandler);
// Ownership (patient-self or meeting:read) is resolved in the service.
router.get("/meetings/:meetingId/presence", requireAuthenticated(), validateParams(meetingIdParamSchema), getMeetingPresenceHandler);
// Issues a role-scoped Daily join token.
router.post(
  "/meetings/:meetingId/token",
  requireAuthenticated(),
  validateParams(meetingIdParamSchema),
  validateBody(z.object({ userName: z.string().trim().max(200).optional() })),
  issueMeetingTokenHandler,
);
// Ownership by the appointment's assigned consultant is resolved in the service.
router.post("/meetings/:meetingId/end", requireAuthenticated(), validateParams(meetingIdParamSchema), endMeetingHandler);
// Lists a meeting's transcript.
router.get("/meetings/:meetingId/transcript", requirePermission("transcript", "read"), validateParams(meetingIdParamSchema), listTranscriptHandler);
// F3.11: editing transcripts is the Scribe's job, so requireRole applies on top of the permission.
router.patch(
  "/transcript/:id",
  requirePermission("transcript", "update"),
  requireRole("SCRIBE"),
  validateParams(transcriptIdParamSchema),
  validateBody(editTranscriptSchema),
  editTranscriptEntryHandler,
);

// F3.11 stage 2 is an ownership check (the assigned oncologist) in the service, not a role class.
router.post(
  "/meetings/:meetingId/sign-off",
  requirePermission("meeting", "update"),
  validateParams(meetingIdParamSchema),
  signOffTranscriptHandler,
);

// Scribe view of the shared transcription queue.
router.get("/transcription-assignments/queue", requirePermission("transcriptionAssignment", "read"), requireRole("SCRIBE"), listTranscriptionQueueHandler);
// Scribe's own assignments.
router.get("/transcription-assignments/mine", requirePermission("transcriptionAssignment", "read"), requireRole("SCRIBE"), listMyTranscriptionAssignmentsHandler);
// Claims an assignment.
router.post(
  "/transcription-assignments/:id/claim",
  requirePermission("transcriptionAssignment", "claim"),
  requireRole("SCRIBE"),
  validateParams(transcriptionAssignmentIdParamSchema),
  claimTranscriptionAssignmentHandler,
);
// Releases an assignment.
router.post(
  "/transcription-assignments/:id/release",
  requirePermission("transcriptionAssignment", "update"),
  requireRole("SCRIBE"),
  validateParams(transcriptionAssignmentIdParamSchema),
  releaseTranscriptionAssignmentHandler,
);
// Finalizes an assignment.
router.post(
  "/transcription-assignments/:id/finalize",
  requirePermission("transcriptionAssignment", "update"),
  requireRole("SCRIBE"),
  validateParams(transcriptionAssignmentIdParamSchema),
  finalizeTranscriptionAssignmentHandler,
);

// Public because Daily calls these directly with no session; authenticity is verified by HMAC in the handler.
router.post("/daily/webhooks/meeting-status", dailyMeetingStatusWebhookHandler);
// public
router.post("/daily/webhooks/transcription", dailyTranscriptionWebhookHandler);
// public
router.post("/daily/webhooks/recording", dailyRecordingWebhookHandler);

export { router as messagingRoutes };
