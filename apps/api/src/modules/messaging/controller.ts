import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { MessagingService, MeetingService, TranscriptionAssignmentService } from "./service.js";
import { verifyDailyWebhookSignature } from "./services/DailyService.js";

const messagingSvc = new MessagingService();
const meetingSvc = new MeetingService();
const transcriptionAssignmentSvc = new TranscriptionAssignmentService();

export async function startConversationHandler(req: Request, res: Response) {
  try {
    const { patientId, conversationType, assignedTo } = req.body;
    const result = await messagingSvc.startConversation({ patientId, conversationType, assignedTo });
    res.status(201).json({ conversation: result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
}

export async function getConversationHandler(req: Request, res: Response) {
  try {
    const result = await messagingSvc.getConversation(String(req.params.id));
    res.json({ conversation: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(message === "Conversation not found" ? 404 : 500).json({ error: message });
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
    const result = patientId
      ? await messagingSvc.listByPatient(patientId)
      : await messagingSvc.listByAssignee(assignedTo!);
    res.json({ conversations: result });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function postMessageHandler(req: Request, res: Response) {
  try {
    const { senderId, type, content } = req.body;
    const result = await messagingSvc.postMessage({
      conversationId: String(req.params.id), senderId, type, content,
    });
    res.status(201).json({ message: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(message === "Conversation not found" ? 404 : 500).json({ error: message });
  }
}

export async function listMessagesHandler(req: Request, res: Response) {
  try {
    const result = await messagingSvc.listMessages(String(req.params.id));
    res.json({ messages: result });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function closeConversationHandler(req: Request, res: Response) {
  try {
    const result = await messagingSvc.closeConversation(String(req.params.id));
    res.json({ conversation: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(message === "Conversation not found" ? 404 : 500).json({ error: message });
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
    const result = await meetingSvc.getByAppointment(appointmentId);
    if (!result) {
      res.status(404).json({ error: "No meeting for this appointment" });
      return;
    }
    res.json({ meeting: result });
  } catch {
    res.status(500).json({ error: "Internal server error" });
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
