import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { MessagingService, MeetingService, TranscriptionAssignmentService } from "./service.js";
import { verifyDailyWebhookSignature } from "./services/DailyService.js";

const messagingSvc = new MessagingService();
const meetingSvc = new MeetingService();
const transcriptionAssignmentSvc = new TranscriptionAssignmentService();

function messagingErrorStatus(message: string): number {
  if (message === "Conversation not found" || message === "Appointment not found" || message === "Patient not found") return 404;
  // Checked before the broader "You can only" 403 prefix below, since these are more specific
  // and would otherwise be shadowed by it.
  if (
    message.startsWith("You already have an open")
    || message === "This conversation has been closed"
    || message.startsWith("Feedback can only be left")
    || message.startsWith("You've already submitted feedback")
  ) return 409;
  if (message === "Forbidden" || message.startsWith("You can only") || message.startsWith("Reporting a side effect requires")) return 403;
  return 500;
}

export async function startConversationHandler(req: Request, res: Response) {
  try {
    const { patientId, conversationType, assignedTo } = req.body;
    const callerId = (req as AuthenticatedRequest).userId;
    const result = await messagingSvc.startConversation({ patientId, conversationType, assignedTo }, callerId);
    res.status(201).json({ conversation: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(messagingErrorStatus(message)).json({ error: message });
  }
}

export async function getConversationHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const result = await messagingSvc.getConversation(String(req.params.id), callerId);
    res.json({ conversation: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(messagingErrorStatus(message)).json({ error: message });
  }
}

export async function listConversationsHandler(req: Request, res: Response) {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    const assignedTo = typeof req.query.assignedTo === "string" ? req.query.assignedTo : undefined;
    if (!patientId && !assignedTo) {
      res.status(400).json({ error: "Provide patientId or assignedTo" });
      return;
    }
    const callerId = (req as AuthenticatedRequest).userId;
    const result = patientId
      ? await messagingSvc.listByPatient(patientId, callerId)
      : await messagingSvc.listByAssignee(assignedTo!, callerId);
    res.json({ conversations: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(messagingErrorStatus(message)).json({ error: message });
  }
}

export async function postMessageHandler(req: Request, res: Response) {
  try {
    const { type, content } = req.body;
    const callerId = (req as AuthenticatedRequest).userId;
    const result = await messagingSvc.postMessage({
      conversationId: String(req.params.id), type, content,
    }, callerId);
    res.status(201).json({ message: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(messagingErrorStatus(message)).json({ error: message });
  }
}

export async function startSideEffectReportHandler(req: Request, res: Response) {
  try {
    const { patientId, message } = req.body;
    const callerId = (req as AuthenticatedRequest).userId;
    const result = await messagingSvc.startSideEffectReport(patientId, message, callerId);
    if (!result.paid) {
      res.status(402).json({ error: "Insufficient wallet balance", invoice: result.invoice });
      return;
    }
    res.status(201).json({ conversation: result.conversation, message: result.message, invoice: result.invoice });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(messagingErrorStatus(message)).json({ error: message });
  }
}

export async function listMessagesHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const result = await messagingSvc.listMessages(String(req.params.id), callerId);
    res.json({ messages: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(messagingErrorStatus(message)).json({ error: message });
  }
}

export async function closeConversationHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const result = await messagingSvc.closeConversation(String(req.params.id), callerId);
    res.json({ conversation: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(messagingErrorStatus(message)).json({ error: message });
  }
}

export async function submitFeedbackHandler(req: Request, res: Response) {
  try {
    const { rating, review } = req.body;
    const callerId = (req as AuthenticatedRequest).userId;
    const result = await messagingSvc.submitFeedback(String(req.params.id), rating, review, callerId);
    res.status(201).json({ feedback: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(messagingErrorStatus(message)).json({ error: message });
  }
}

export async function listFeedbackHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const result = await messagingSvc.listFeedback(String(req.params.id), callerId);
    res.json({ feedback: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(messagingErrorStatus(message)).json({ error: message });
  }
}

export async function provisionMeetingHandler(req: Request, res: Response) {
  try {
    const { appointmentId } = req.body;
    const result = await meetingSvc.provisionRoom(appointmentId);
    res.status(201).json({ meeting: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("already exists") ? 409 : message.includes("not configured") ? 502 : 500;
    res.status(status).json({ error: message });
  }
}

export async function getMeetingHandler(req: Request, res: Response) {
  try {
    const appointmentId = typeof req.query.appointmentId === "string" ? req.query.appointmentId : undefined;
    if (!appointmentId) {
      res.status(400).json({ error: "appointmentId query parameter required" });
      return;
    }
    const callerId = (req as AuthenticatedRequest).userId;
    const result = await meetingSvc.getByAppointment(appointmentId, callerId);
    if (!result) {
      res.status(404).json({ error: "No meeting for this appointment" });
      return;
    }
    res.json({ meeting: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(messagingErrorStatus(message)).json({ error: message });
  }
}

export async function getMeetingPresenceHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const result = await meetingSvc.getPresence(String(req.params.meetingId), callerId);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message === "Meeting not found" || message === "Appointment not found" ? 404
      : message === "Forbidden" ? 403
      : message.includes("not configured") ? 502
      : 500;
    res.status(status).json({ error: message });
  }
}

export async function endMeetingHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const result = await meetingSvc.endCall(String(req.params.meetingId), callerId);
    res.json({ meeting: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message === "Meeting not found" || message === "Appointment not found" ? 404
      : message.startsWith("Only the appointment's assigned consultant") ? 403
      : message.startsWith("Cannot transition") ? 409
      : 500;
    res.status(status).json({ error: message });
  }
}

export async function issueMeetingTokenHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const userName = typeof req.body?.userName === "string" && req.body.userName.trim() ? req.body.userName.trim() : "Participant";
    const result = await meetingSvc.issueToken(String(req.params.meetingId), callerId, userName);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message === "Meeting not found" || message === "Appointment not found" ? 404
      : message === "Forbidden" ? 403
      : message.includes("not configured") ? 502
      : 500;
    res.status(status).json({ error: message });
  }
}

function requireVerifiedDailyWebhook(req: Request, res: Response): string | null {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const timestamp = req.header("X-Webhook-Timestamp");
  const signature = req.header("X-Webhook-Signature");
  if (!rawBody || !timestamp || !signature) {
    res.status(400).json({ error: "Missing webhook signature headers" });
    return null;
  }
  let valid: boolean;
  try {
    valid = verifyDailyWebhookSignature(rawBody.toString("utf-8"), timestamp, signature);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Webhook verification unavailable" });
    return null;
  }
  if (!valid) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return null;
  }
  return rawBody.toString("utf-8");
}

// F3.7 DoD: signature verification confirmed on both the meeting-status and transcription
// webhooks — requireVerifiedDailyWebhook() is the shared gate both handlers go through
// before touching anything from the payload.
export async function dailyMeetingStatusWebhookHandler(req: Request, res: Response) {
  if (!requireVerifiedDailyWebhook(req, res)) return;
  try {
    const { room, status } = req.body as { room: string; status: "SCHEDULED" | "IN_PROGRESS" | "ENDED" };
    const result = await meetingSvc.syncStatus(room, status);
    res.json({ meeting: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message === "Meeting not found for this room" ? 404 : message.startsWith("Cannot transition") ? 409 : 500;
    res.status(status).json({ error: message });
  }
}

// §5 — best-effort payload shape, see MeetingService.recordRecordingEvent's comment.
export async function dailyRecordingWebhookHandler(req: Request, res: Response) {
  if (!requireVerifiedDailyWebhook(req, res)) return;
  try {
    const body = req.body as {
      recording_id?: string; room_name?: string; status?: string; download_link?: string; duration?: number;
    };
    if (!body.recording_id || !body.room_name || !body.status) {
      res.status(400).json({ error: "Missing recording_id/room_name/status" });
      return;
    }
    const status = ["processing", "ready", "failed", "cancelled"].includes(body.status) ? body.status as "processing" | "ready" | "failed" | "cancelled" : "processing";
    const result = await meetingSvc.recordRecordingEvent({
      recordingId: body.recording_id, roomName: body.room_name, status,
      downloadUrl: body.download_link, durationSeconds: body.duration,
    });
    res.json({ recording: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(message === "Meeting not found for this room" ? 404 : 500).json({ error: message });
  }
}

export async function dailyTranscriptionWebhookHandler(req: Request, res: Response) {
  if (!requireVerifiedDailyWebhook(req, res)) return;
  try {
    const { meetingId, speaker, content } = req.body as { meetingId: string; speaker: string; content: string };
    const result = await meetingSvc.appendTranscript(meetingId, { speaker, content });
    res.status(201).json({ transcript: result });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function listTranscriptHandler(req: Request, res: Response) {
  try {
    const result = await meetingSvc.listTranscript(String(req.params.meetingId));
    res.json({ transcript: result });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function editTranscriptEntryHandler(req: Request, res: Response) {
  try {
    const editedBy = (req as AuthenticatedRequest).userId;
    const { content } = req.body;
    const result = await meetingSvc.editTranscriptEntry(String(req.params.id), content, editedBy);
    res.json({ transcript: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message === "Transcript entry not found" ? 404 : message.startsWith("You can only") ? 403 : 500;
    res.status(status).json({ error: message });
  }
}

// F3.11 stage 2 — the respective consultant signing off on a Scribe-corrected transcript.
export async function signOffTranscriptHandler(req: Request, res: Response) {
  try {
    const consultantId = (req as AuthenticatedRequest).userId;
    const result = await meetingSvc.signOffTranscript(String(req.params.meetingId), consultantId);
    res.json({ meeting: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message === "Meeting not found" ? 404
      : message.startsWith("Only the appointment's assigned consultant") ? 403
      : message.startsWith("Cannot sign off") || message === "Transcript already signed off" ? 409
      : 500;
    res.status(status).json({ error: message });
  }
}

// F3.11 — Scribe transcription queue/claim/finalize handlers.
function transcriptionAssignmentErrorStatus(message: string): number {
  if (message === "Transcription assignment not found" || message === "Meeting not found") return 404;
  if (message.startsWith("Backlog cap reached")) return 409;
  if (message.startsWith("You can only")) return 403;
  if (message.startsWith("Cannot transition") || message === "Transcript correction already recorded") return 409;
  return 500;
}

export async function listTranscriptionQueueHandler(_req: Request, res: Response) {
  try {
    const result = await transcriptionAssignmentSvc.listQueue();
    res.json({ assignments: result });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function listMyTranscriptionAssignmentsHandler(req: Request, res: Response) {
  try {
    const scribeId = (req as AuthenticatedRequest).userId;
    const result = await transcriptionAssignmentSvc.listMine(scribeId);
    res.json({ assignments: result });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function claimTranscriptionAssignmentHandler(req: Request, res: Response) {
  try {
    const scribeId = (req as AuthenticatedRequest).userId;
    const result = await transcriptionAssignmentSvc.claim(String(req.params.id), scribeId);
    res.json({ assignment: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(transcriptionAssignmentErrorStatus(message)).json({ error: message });
  }
}

export async function releaseTranscriptionAssignmentHandler(req: Request, res: Response) {
  try {
    const scribeId = (req as AuthenticatedRequest).userId;
    const result = await transcriptionAssignmentSvc.release(String(req.params.id), scribeId);
    res.json({ assignment: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(transcriptionAssignmentErrorStatus(message)).json({ error: message });
  }
}

export async function finalizeTranscriptionAssignmentHandler(req: Request, res: Response) {
  try {
    const scribeId = (req as AuthenticatedRequest).userId;
    const result = await transcriptionAssignmentSvc.finalize(String(req.params.id), scribeId);
    res.json({ assignment: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(transcriptionAssignmentErrorStatus(message)).json({ error: message });
  }
}
