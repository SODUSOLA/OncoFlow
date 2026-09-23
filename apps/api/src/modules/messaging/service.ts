import crypto from "node:crypto";
import {
  ConversationRepository, ParticipantRepository, MessageRepository, MeetingRepository, TranscriptRepository,
  TranscriptionAssignmentRepository, ConversationFeedbackRepository, MeetingRecordingRepository,
} from "./repository.js";
import { Conversation } from "./entities/Conversation.js";
import { Message } from "./entities/Message.js";
import { Meeting } from "./entities/Meeting.js";
import { Transcript } from "./entities/Transcript.js";
import { TranscriptionAssignment } from "./entities/TranscriptionAssignment.js";
import { ConversationFeedback } from "./entities/ConversationFeedback.js";
import { createDailyRoom, getDailyRoomPresence, createDailyMeetingToken, getDailyRoomUrl } from "./services/DailyService.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { userHasRole, userHasPermission } from "../../lib/rbac.js";
import { PatientRepository } from "../patient/index.js";
import { AppointmentRepository, AppointmentParticipantRepository } from "../appointment/index.js";
import { InvoiceService, InvoiceRepository, ServiceClassificationRepository } from "../billing/index.js";
import { Invoice } from "../billing/entities/Invoice.js";
import { PaymentService } from "../billing/services/PaymentService.js";
import { sideEffectReportFeeKobo } from "./entities/side-effect-pricing.js";
import { MessagingJobService } from "./services/MessagingJobService.js";
import { notificationService } from "../notification/index.js";
import { getIo, isIoAttached } from "../../lib/socket.js";
import type { conversationTypeEnum, messageTypeEnum, meetingStatusEnum } from "../../db/enums.js";

type ConversationType = (typeof conversationTypeEnum.enumValues)[number];
type MessageType = (typeof messageTypeEnum.enumValues)[number];
type MeetingStatus = (typeof meetingStatusEnum.enumValues)[number];

const conversationRepo = new ConversationRepository();
const participantRepo = new ParticipantRepository();
const messageRepo = new MessageRepository();
const patientRepo = new PatientRepository();
const meetingRepo = new MeetingRepository();
const transcriptRepo = new TranscriptRepository();
const transcriptionAssignmentRepo = new TranscriptionAssignmentRepository();
const feedbackRepo = new ConversationFeedbackRepository();
const appointmentRepo = new AppointmentRepository();
const apptParticipantRepo = new AppointmentParticipantRepository();
const recordingRepo = new MeetingRecordingRepository();
const invoiceSvc = new InvoiceService();
const invoiceRepo = new InvoiceRepository();
const classificationRepo = new ServiceClassificationRepository();
const paymentSvc = new PaymentService();
const messagingJobService = new MessagingJobService();

// Proposed global backlog cap of 5 per scribe (F3.11 §5); a per-scribe override isn't warranted yet.
const TRANSCRIPTION_BACKLOG_CAP = 5;

// Ownership-or-permission: patients need no blanket grant for their own conversations, and can't see anyone else's.
async function callerOwnsPatient(callerId: string, patientId: string): Promise<boolean> {
  const patientRow = await patientRepo.findById(patientId);
  return !!patientRow?.userId && patientRow.userId === callerId;
}

// Attaches each conversation's latest message for list previews; non-TEXT messages are flagged by type since their content is a file id.
async function withLastMessage(rows: Awaited<ReturnType<ConversationRepository["findByPatient"]>>) {
  const latest = await messageRepo.findLatestByConversations(rows.map((r) => r.id));
  const byConversation = new Map(latest.map((m) => [m.conversationId, m]));

  return rows.map((r) => {
    const m = byConversation.get(r.id);
    return {
      ...new Conversation(r).toJSON(),
      lastMessage: m
        ? { id: m.id, senderId: m.senderId, type: m.type, content: m.content, createdAt: m.createdAt }
        : null,
    };
  });
}

// Business logic for conversations and messages.
export class MessagingService {
  async startConversation(
    data: { patientId: string; conversationType: ConversationType; assignedTo?: string },
    callerId: string,
  ) {
    const isSelf = await callerOwnsPatient(callerId, data.patientId);
    // Self-service side-effect reports carry a fee and only start through startSideEffectReport; staff opening one on a patient's behalf stay free.
    if (isSelf && data.conversationType === "MO_SIDE_EFFECT") {
      throw new ForbiddenError("Reporting a side effect requires paying the report fee first");
    }
    if (!isSelf && !(await userHasPermission(callerId, "conversation", "create"))) {
      throw new ForbiddenError("You can only start a conversation for your own patient record");
    }

    const row = await this.createConversationRecord(data.patientId, data.conversationType, data.assignedTo);
    return new Conversation(row).toJSON();
  }

  // Creates the conversation row with its SLA deadline and participants.
  private async createConversationRecord(patientId: string, conversationType: ConversationType, assignedTo?: string) {
    const now = new Date();
    const row = await conversationRepo.create({
      id: crypto.randomUUID(),
      patientId,
      conversationType,
      status: "OPEN",
      slaDeadline: Conversation.slaDeadlineFor(conversationType, now),
      assignedTo: assignedTo ?? null,
    });

    // A patient only gets a participant row if they have a linked user account, since patient.user_id is nullable.
    const patientRow = await patientRepo.findById(patientId);
    if (patientRow?.userId) {
      await participantRepo.create({ conversationId: row.id, userId: patientRow.userId });
    }
    if (assignedTo) {
      await participantRepo.create({ conversationId: row.id, userId: assignedTo });
    }

    return row;
  }

  // Creates, sends and wallet-pays a side-effect invoice before creating the conversation, returning the unpaid invoice on insufficient balance.
  async startSideEffectReport(patientId: string, message: string, callerId: string) {
    const isSelf = await callerOwnsPatient(callerId, patientId);
    if (!isSelf) {
      throw new ForbiddenError("You can only report a side effect for your own patient record");
    }

    // Backstop for the frontend rule: an OPEN report is still live and follow-ups are free, while a CLOSED one means a new report and fee.
    const existingOpen = (await conversationRepo.findByPatient(patientId))
      .find((c) => c.conversationType === "MO_SIDE_EFFECT" && c.status === "OPEN");
    if (existingOpen) {
      throw new ForbiddenError("You already have an open side-effect report — reply there instead");
    }

    const patientRow = await patientRepo.findById(patientId);
    if (!patientRow) throw new NotFoundError("Patient not found");

    const classificationRow = await classificationRepo.findByName("SIDE_EFFECT_REPORT");
    if (!classificationRow) throw new Error("Side-effect report fee is not configured");

    const { invoiceId } = await invoiceSvc.createInvoiceWithFixedFee({
      patientId,
      facilityId: patientRow.facilityId,
      classificationId: classificationRow.id,
      feeKobo: sideEffectReportFeeKobo(),
    });
    await invoiceSvc.sendInvoice(invoiceId);

    try {
      await paymentSvc.payInvoiceWithWallet(invoiceId);
    } catch {
      const unpaidRow = await invoiceRepo.findById(invoiceId);
      return { paid: false as const, invoice: new Invoice(unpaidRow!).toJSON() };
    }

    const conversationRow = await this.createConversationRecord(patientId, "MO_SIDE_EFFECT");
    const messageResult = await this.postMessage(
      { conversationId: conversationRow.id, type: "TEXT", content: message },
      callerId,
    );

    const paidRow = await invoiceRepo.findById(invoiceId);
    return {
      paid: true as const,
      conversation: new Conversation(conversationRow).toJSON(),
      message: messageResult,
      invoice: new Invoice(paidRow!).toJSON(),
    };
  }

  // Returns a conversation for its patient or permitted staff.
  async getConversation(id: string, callerId: string) {
    const row = await conversationRepo.findById(id);
    if (!row) throw new NotFoundError("Conversation not found");

    const isSelf = await callerOwnsPatient(callerId, row.patientId);
    if (!isSelf && !(await userHasPermission(callerId, "conversation", "read"))) {
      throw new ForbiddenError("Forbidden");
    }
    return new Conversation(row).toJSON();
  }

  // Lists a patient's conversations and marks the other party's messages delivered.
  async listByPatient(patientId: string, callerId: string) {
    const isSelf = await callerOwnsPatient(callerId, patientId);
    if (!isSelf && !(await userHasPermission(callerId, "conversation", "read"))) {
      throw new ForbiddenError("Forbidden");
    }
    const rows = await conversationRepo.findByPatient(patientId);
    // WhatsApp-style delivered: the caller fetched this list, so the other party's messages have reached them.
    const patientRow = await patientRepo.findById(patientId);
    for (const row of rows) {
      await messageRepo.markDeliveredForViewer(row.id, patientRow?.userId ?? null, isSelf);
    }
    return withLastMessage(rows);
  }

  // Staff-only path with no ownership branch, just the permission.
  async listByAssignee(assignedTo: string, callerId: string) {
    if (!(await userHasPermission(callerId, "conversation", "read"))) {
      throw new ForbiddenError("Forbidden");
    }
    const rows = await conversationRepo.findByAssignee(assignedTo);
    for (const row of rows) {
      const patientRow = await patientRepo.findById(row.patientId);
      await messageRepo.markDeliveredForViewer(row.id, patientRow?.userId ?? null, false);
    }
    return withLastMessage(rows);
  }

  // Posts a message; senderId is never taken from the request, since accepting it allowed impersonating a doctor, and the first real message stamps first_response_at.
  async postMessage(
    data: { conversationId: string; type: MessageType; content: string },
    callerId: string,
  ) {
    const conversationRow = await conversationRepo.findById(data.conversationId);
    if (!conversationRow) throw new NotFoundError("Conversation not found");

    const isSelf = await callerOwnsPatient(callerId, conversationRow.patientId);
    if (!isSelf && !(await userHasPermission(callerId, "message", "create"))) {
      throw new ForbiddenError("Forbidden");
    }
    if (conversationRow.status === "CLOSED") {
      throw new ConflictError("This conversation has been closed");
    }

    const messageRow = await messageRepo.create({
      id: crypto.randomUUID(),
      conversationId: data.conversationId,
      senderId: callerId,
      type: data.type,
      content: data.content,
    });
    const messageEntity = new Message(messageRow);

    if (messageEntity.countsAsFirstResponse && !conversationRow.firstResponseAt) {
      const existingRealMessage = await messageRepo.findFirstRealMessage(data.conversationId);
      // Only stamps when this is the first real message, so a later one never overwrites first_response_at.
      if (existingRealMessage && existingRealMessage.id === messageRow.id) {
        await conversationRepo.update(data.conversationId, { firstResponseAt: messageRow.createdAt });
      }
    }

    const json = messageEntity.toJSON();
    // Emits only when a Socket.IO server is attached, so it is a no-op in tests.
    if (isIoAttached()) {
      getIo().to(`conversation:${data.conversationId}`).emit("message:new", json);
    }

    return json;
  }

  // Lists a conversation's messages, marking the other party's read.
  async listMessages(conversationId: string, callerId: string) {
    const conversationRow = await conversationRepo.findById(conversationId);
    if (!conversationRow) throw new NotFoundError("Conversation not found");

    const isSelf = await callerOwnsPatient(callerId, conversationRow.patientId);
    if (!isSelf && !(await userHasPermission(callerId, "message", "read"))) {
      throw new ForbiddenError("Forbidden");
    }

    // Lazy SLA sweep as a side effect of a read, needing no scheduler.
    await messagingJobService.sweepSlaBreaches().catch((err) => {
      console.error("SLA breach sweep failed:", err);
    });

    // WhatsApp-style read: opening the thread marks the other party's messages read before responding.
    const patientRow = await patientRepo.findById(conversationRow.patientId);
    await messageRepo.markReadForViewer(conversationId, patientRow?.userId ?? null, isSelf);

    const rows = await messageRepo.findByConversation(conversationId);
    return rows.map((r) => new Message(r).toJSON());
  }

  // Either the patient or staff with conversation:update can close a report; closed reports reject replies and can't be reopened.
  async closeConversation(id: string, callerId: string) {
    const row = await conversationRepo.findById(id);
    if (!row) throw new NotFoundError("Conversation not found");

    const isSelf = await callerOwnsPatient(callerId, row.patientId);
    if (!isSelf && !(await userHasPermission(callerId, "conversation", "update"))) {
      throw new ForbiddenError("Forbidden");
    }

    const updated = new Conversation(row).close();
    const saved = await conversationRepo.update(id, { status: updated.status });
    return new Conversation(saved!).toJSON();
  }

  // Mutual rating, once per rater and only after the encounter is over, backed by a unique index.
  async submitFeedback(conversationId: string, rating: number, review: string | undefined, callerId: string) {
    const row = await conversationRepo.findById(conversationId);
    if (!row) throw new NotFoundError("Conversation not found");

    const isSelf = await callerOwnsPatient(callerId, row.patientId);
    if (!isSelf && !(await userHasPermission(callerId, "conversation", "read"))) {
      throw new ForbiddenError("Forbidden");
    }
    if (row.status !== "CLOSED") {
      throw new ConflictError("Feedback can only be left once the conversation has ended");
    }

    const existing = await feedbackRepo.findByConversationAndRater(conversationId, callerId);
    if (existing) {
      throw new ConflictError("You've already submitted feedback for this conversation");
    }

    const feedbackRow = await feedbackRepo.create({
      id: crypto.randomUUID(),
      conversationId,
      raterId: callerId,
      raterRole: isSelf ? "PATIENT" : "STAFF",
      rating,
      review: review ?? null,
    });

    // Notifies the other party, best-effort like every other notification hook.
    const recipientId = isSelf ? row.assignedTo : (await patientRepo.findById(row.patientId))?.userId;
    if (recipientId) {
      await notificationService.create({ recipientId, type: "CONVERSATION_FEEDBACK" }).catch((err) => {
        console.error(`Feedback notification failed for conversation ${conversationId}:`, err);
      });
    }

    return new ConversationFeedback(feedbackRow).toJSON();
  }

  // Lists a conversation's feedback.
  async listFeedback(conversationId: string, callerId: string) {
    const row = await conversationRepo.findById(conversationId);
    if (!row) throw new NotFoundError("Conversation not found");

    const isSelf = await callerOwnsPatient(callerId, row.patientId);
    if (!isSelf && !(await userHasPermission(callerId, "conversation", "read"))) {
      throw new ForbiddenError("Forbidden");
    }

    const rows = await feedbackRepo.findByConversation(conversationId);
    return rows.map((r) => new ConversationFeedback(r).toJSON());
  }
}

// The shared scribe transcription queue; completing an assignment is also finalizing the meeting's transcript, in one action.
export class TranscriptionAssignmentService {
  // Queues a transcript for review when a meeting ENDS; UNIQUE(meeting_id) plus the one-time ENDED transition prevent duplicates.
  async queueForMeeting(meetingId: string) {
    const now = new Date();
    const row = await transcriptionAssignmentRepo.create({
      id: crypto.randomUUID(),
      meetingId,
      status: "QUEUED",
      queuedAt: now,
      slaDeadline: TranscriptionAssignment.slaDeadlineFor(now),
    });
    return new TranscriptionAssignment(row).toJSON();
  }

  // Lists the unclaimed queue.
  async listQueue() {
    const rows = await transcriptionAssignmentRepo.findQueue();
    return rows.map((r) => new TranscriptionAssignment(r).toJSON());
  }

  // Lists a scribe's assignments.
  async listMine(scribeId: string) {
    const rows = await transcriptionAssignmentRepo.findByScribe(scribeId);
    return rows.map((r) => new TranscriptionAssignment(r).toJSON());
  }

  // Claims an assignment for a scribe, enforcing the backlog cap.
  async claim(id: string, scribeId: string) {
    const row = await transcriptionAssignmentRepo.findById(id);
    if (!row) throw new NotFoundError("Transcription assignment not found");

    const activeCount = await transcriptionAssignmentRepo.countActiveForScribe(scribeId);
    if (activeCount >= TRANSCRIPTION_BACKLOG_CAP) {
      throw new ConflictError(`Backlog cap reached (${TRANSCRIPTION_BACKLOG_CAP} concurrent claims)`);
    }

    const updated = new TranscriptionAssignment(row).claim(scribeId, new Date());
    const saved = await transcriptionAssignmentRepo.update(id, {
      status: updated.status, scribeId: updated.scribeId, claimedAt: updated.claimedAt,
    });
    return new TranscriptionAssignment(saved!).toJSON();
  }

  // Releases an assignment back to the queue.
  async release(id: string, scribeId: string) {
    const row = await transcriptionAssignmentRepo.findById(id);
    if (!row) throw new NotFoundError("Transcription assignment not found");
    if (row.scribeId !== scribeId) {
      throw new ForbiddenError("You can only release your own claimed assignments");
    }

    const updated = new TranscriptionAssignment(row).release();
    const saved = await transcriptionAssignmentRepo.update(id, {
      status: updated.status, scribeId: updated.scribeId, claimedAt: updated.claimedAt,
    });
    return new TranscriptionAssignment(saved!).toJSON();
  }

  // Completes the assignment and records the Scribe's stage 1 correction on the meeting in one call; it doesn't make the transcript citable.
  async finalize(id: string, scribeId: string) {
    const row = await transcriptionAssignmentRepo.findById(id);
    if (!row) throw new NotFoundError("Transcription assignment not found");
    if (row.scribeId !== scribeId) {
      throw new ForbiddenError("You can only finalize your own claimed assignments");
    }

    const now = new Date();
    const updated = new TranscriptionAssignment(row).complete(now);
    const saved = await transcriptionAssignmentRepo.update(id, {
      status: updated.status, completedAt: updated.completedAt,
    });

    const meetingRow = await meetingRepo.findById(row.meetingId);
    if (!meetingRow) throw new NotFoundError("Meeting not found");
    const corrected = new Meeting(meetingRow).recordTranscriptCorrection(scribeId, now);
    await meetingRepo.update(row.meetingId, {
      transcriptCorrectedAt: corrected.transcriptCorrectedAt,
      transcriptCorrectedBy: corrected.transcriptCorrectedBy,
    });

    // Placeholder for notifying the assigned consultant that sign-off is needed; the notification module has no queue wiring yet.

    return new TranscriptionAssignment(saved!).toJSON();
  }
}

const transcriptionAssignmentSvc = new TranscriptionAssignmentService();

// Daily room provisioning and webhook-driven status sync; webhook signatures must be verified in the controller before these run.
export class MeetingService {
  // Idempotent under races: concurrent callers re-check and return the winner's meeting; opts sets Daily's expiry when scheduling-time provisioning knows the window.
  async provisionRoom(appointmentId: string, opts?: { scheduledAt: Date; durationMinutes: number }) {
    const existing = await meetingRepo.findByAppointment(appointmentId);
    if (existing) {
      throw new ConflictError("A meeting already exists for this appointment");
    }

    // 30-minute grace past the appointment's end, so a long call doesn't leave the room joinable forever.
    const GRACE_MINUTES = 30;
    const expDate = opts ? new Date(opts.scheduledAt.getTime() + (opts.durationMinutes + GRACE_MINUTES) * 60_000) : undefined;
    const exp = expDate ? Math.floor(expDate.getTime() / 1000) : undefined;

    let roomId: string;
    try {
      ({ roomId } = await createDailyRoom(`appointment-${appointmentId}`, { exp }));
    } catch (err) {
      const raced = await meetingRepo.findByAppointment(appointmentId);
      if (raced) return new Meeting(raced).toJSON();
      throw err;
    }

    try {
      const row = await meetingRepo.create({
        id: crypto.randomUUID(),
        appointmentId,
        provider: "daily.co",
        roomId,
        status: "SCHEDULED",
        dailyRoomExp: expDate ?? null,
      });
      return new Meeting(row).toJSON();
    } catch (err) {
      const raced = await meetingRepo.findByAppointment(appointmentId);
      if (raced) return new Meeting(raced).toJSON();
      throw err;
    }
  }

  // Lets a patient join their own consult without meeting:read; ownership is resolved via the appointment's patientId.
  async getByAppointment(appointmentId: string, callerId: string) {
    const appointmentRow = await appointmentRepo.findById(appointmentId);
    if (!appointmentRow) throw new NotFoundError("Appointment not found");

    const isSelf = await callerOwnsPatient(callerId, appointmentRow.patientId);
    if (!isSelf && !(await userHasPermission(callerId, "meeting", "read"))) {
      throw new ForbiddenError("Forbidden");
    }

    const row = await meetingRepo.findByAppointment(appointmentId);
    return row ? new Meeting(row).toJSON() : null;
  }

  // Same ownership rule, letting the Pre-call Briefing know whether the patient has actually connected.
  async getPresence(meetingId: string, callerId: string) {
    const meetingRow = await meetingRepo.findById(meetingId);
    if (!meetingRow) throw new NotFoundError("Meeting not found");
    const appointmentRow = await appointmentRepo.findById(meetingRow.appointmentId);
    if (!appointmentRow) throw new NotFoundError("Appointment not found");

    const isSelf = await callerOwnsPatient(callerId, appointmentRow.patientId);
    if (!isSelf && !(await userHasPermission(callerId, "meeting", "read"))) {
      throw new ForbiddenError("Forbidden");
    }
    return getDailyRoomPresence(meetingRow.roomId);
  }

  // Issues a role-scoped join token; requires appointment membership (oncologist, patient or invited participant), not a broad meeting:read grant.
  async issueToken(meetingId: string, callerId: string, callerName: string) {
    const meetingRow = await meetingRepo.findById(meetingId);
    if (!meetingRow) throw new NotFoundError("Meeting not found");
    const appointmentRow = await appointmentRepo.findById(meetingRow.appointmentId);
    if (!appointmentRow) throw new NotFoundError("Appointment not found");

    const isSuperAdmin = await userHasRole(callerId, "SUPER_ADMIN");
    const isOncologist = appointmentRow.oncologistId === callerId;
    const isSelf = await callerOwnsPatient(callerId, appointmentRow.patientId);
    const isInvitedParticipant = isSuperAdmin || isOncologist || isSelf
      ? true
      : (await apptParticipantRepo.findByAppointment(appointmentRow.id)).some((p) => p.userId === callerId);
    if (!isInvitedParticipant) {
      throw new ForbiddenError("Forbidden");
    }

    const token = await createDailyMeetingToken(meetingRow.roomId, {
      isOwner: isSuperAdmin || isOncologist,
      userName: callerName,
    });
    return { token, roomId: meetingRow.roomId, roomUrl: getDailyRoomUrl(meetingRow.roomId), isOwner: isSuperAdmin || isOncologist };
  }

  // Clinician-driven End Call as a second path to ENDED, so a missing webhook can't leave endedAt unset; idempotent.
  async endCall(meetingId: string, callerId: string) {
    const meetingRow = await meetingRepo.findById(meetingId);
    if (!meetingRow) throw new NotFoundError("Meeting not found");
    const appointmentRow = await appointmentRepo.findById(meetingRow.appointmentId);
    if (!appointmentRow) throw new NotFoundError("Appointment not found");

    const isSuperAdmin = await userHasRole(callerId, "SUPER_ADMIN");
    if (!isSuperAdmin && appointmentRow.oncologistId !== callerId) {
      throw new ForbiddenError("Only the appointment's assigned consultant can end this call");
    }
    if (meetingRow.status === "ENDED") {
      return new Meeting(meetingRow).toJSON();
    }

    const updated = new Meeting(meetingRow).transitionTo("ENDED");
    const saved = await meetingRepo.update(meetingId, { status: updated.status, endedAt: new Date() });
    await transcriptionAssignmentSvc.queueForMeeting(meetingId);
    return new Meeting(saved!).toJSON();
  }

  // Upserts Daily's recording webhook by recording id; field names are unverified against a real delivery, so confirm them before production.
  async recordRecordingEvent(data: {
    recordingId: string; roomName: string; status: "processing" | "ready" | "failed" | "cancelled";
    downloadUrl?: string; durationSeconds?: number;
  }) {
    const meetingRow = await meetingRepo.findByRoomId(data.roomName);
    if (!meetingRow) throw new NotFoundError("Meeting not found for this room");

    const status = data.status === "ready" ? "AVAILABLE" : data.status === "failed" || data.status === "cancelled" ? "FAILED" : "PROCESSING";
    const existing = await recordingRepo.findByDailyId(data.recordingId);
    if (existing) {
      return recordingRepo.update(existing.id, {
        status, downloadUrl: data.downloadUrl ?? existing.downloadUrl, durationSeconds: data.durationSeconds ?? existing.durationSeconds,
        completedAt: status === "AVAILABLE" || status === "FAILED" ? new Date() : existing.completedAt,
      });
    }
    return recordingRepo.create({
      id: crypto.randomUUID(), meetingId: meetingRow.id, dailyRecordingId: data.recordingId,
      status, downloadUrl: data.downloadUrl ?? null, durationSeconds: data.durationSeconds ?? null,
      startedAt: new Date(), completedAt: status === "AVAILABLE" || status === "FAILED" ? new Date() : null,
    });
  }

  // Maps Daily's status webhook to our meeting status via the entity's transition guard, looking up by room id.
  async syncStatus(roomId: string, targetStatus: MeetingStatus) {
    const row = await meetingRepo.findByRoomId(roomId);
    if (!row) throw new NotFoundError("Meeting not found for this room");
    const updated = new Meeting(row).transitionTo(targetStatus);
    const saved = await meetingRepo.update(row.id, {
      status: updated.status,
      ...(targetStatus === "ENDED" ? { endedAt: new Date() } : {}),
    });

    // F3.11 — a meeting reaching ENDED is what queues its transcript for Scribe review.
    if (targetStatus === "ENDED") {
      await transcriptionAssignmentSvc.queueForMeeting(row.id);
    }

    return new Meeting(saved!).toJSON();
  }

  // Driven by Daily.co's transcription webhook — one Transcript row per utterance.
  async appendTranscript(meetingId: string, data: { speaker: string; content: string }) {
    const row = await transcriptRepo.create({
      id: crypto.randomUUID(),
      meetingId,
      speaker: data.speaker,
      content: data.content,
    });
    return new Transcript(row).toJSON();
  }

  // Lists a meeting's transcript entries.
  async listTranscript(meetingId: string) {
    const rows = await transcriptRepo.findByMeeting(meetingId);
    return rows.map((r) => new Transcript(r).toJSON());
  }

  // Scribes may edit only meetings they've claimed (SUPER_ADMIN bypasses); the one place a correction is an in-place edit.
  async editTranscriptEntry(id: string, content: string, editedBy: string) {
    const row = await transcriptRepo.findById(id);
    if (!row) throw new NotFoundError("Transcript entry not found");

    const isSuperAdmin = await userHasRole(editedBy, "SUPER_ADMIN");
    if (!isSuperAdmin) {
      const assignment = await transcriptionAssignmentRepo.findByMeeting(row.meetingId);
      const ownsClaim = assignment
        && assignment.scribeId === editedBy
        && (assignment.status === "CLAIMED" || assignment.status === "IN_PROGRESS");
      if (!ownsClaim) {
        throw new ForbiddenError("You can only edit transcripts for meetings you have claimed");
      }
    }

    const updated = new Transcript(row).edit(content, editedBy);
    const saved = await transcriptRepo.update(id, { content: updated.content, editedBy: updated.editedBy, editedAt: updated.editedAt });
    return new Transcript(saved!).toJSON();
  }

  // Stage 2: the appointment's assigned oncologist signs off (an ownership check here; the entity only enforces stage ordering).
  async signOffTranscript(meetingId: string, consultantId: string) {
    const meetingRow = await meetingRepo.findById(meetingId);
    if (!meetingRow) throw new NotFoundError("Meeting not found");

    const isSuperAdmin = await userHasRole(consultantId, "SUPER_ADMIN");
    if (!isSuperAdmin) {
      const appointmentRow = await appointmentRepo.findById(meetingRow.appointmentId);
      if (!appointmentRow || appointmentRow.oncologistId !== consultantId) {
        throw new ForbiddenError("Only the appointment's assigned consultant can sign off on this transcript");
      }
    }

    const signedOff = new Meeting(meetingRow).signOffTranscript(consultantId, new Date());
    const saved = await meetingRepo.update(meetingId, {
      transcriptSignedOffAt: signedOff.transcriptSignedOffAt,
      transcriptSignedOffBy: signedOff.transcriptSignedOffBy,
    });
    return new Meeting(saved!).toJSON();
  }
}
