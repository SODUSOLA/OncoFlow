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

// F3.11 §5 — proposed default, not FR-pinned. A global constant for MVP; per-scribe override
// is a reasonable later enhancement, not worth building now (no evidence yet of scribes
// actually having different throughput).
const TRANSCRIPTION_BACKLOG_CAP = 5;

// Ownership-or-permission checks (Patient role spec: "can message assigned Admin/MO channels
// ... cannot view any other patient's data, under any circumstance") — a patient participating
// in their own conversation doesn't need a blanket conversation:*/message:* grant; anyone else
// does.
async function callerOwnsPatient(callerId: string, patientId: string): Promise<boolean> {
  const patientRow = await patientRepo.findById(patientId);
  return !!patientRow?.userId && patientRow.userId === callerId;
}

// Attaches each conversation's most recent message so a list view can show a preview without
// opening the thread. Non-TEXT messages carry a file id in `content`, never something a UI
// should print, so the shape flags the type and lets the client render its own label.
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

export class MessagingService {
  async startConversation(
    data: { patientId: string; conversationType: ConversationType; assignedTo?: string },
    callerId: string,
  ) {
    const isSelf = await callerOwnsPatient(callerId, data.patientId);
    // A patient reporting their own side effect carries a real fee (paid upfront, per report)
    // — that path only exists through startSideEffectReport, which creates+pays the invoice
    // before the conversation exists. Staff opening one on a patient's behalf (e.g. logging a
    // call) still goes through the free permission-gated path below; only self-service is priced.
    if (isSelf && data.conversationType === "MO_SIDE_EFFECT") {
      throw new ForbiddenError("Reporting a side effect requires paying the report fee first");
    }
    if (!isSelf && !(await userHasPermission(callerId, "conversation", "create"))) {
      throw new ForbiddenError("You can only start a conversation for your own patient record");
    }

    const row = await this.createConversationRecord(data.patientId, data.conversationType, data.assignedTo);
    return new Conversation(row).toJSON();
  }

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

    // participant.user_id references User, not Patient — a patient only gets a participant
    // row if they have a linked user account (patient.user_id is nullable; not every patient
    // record has self-service login set up yet). conversation.patient_id already establishes
    // the patient side unambiguously either way.
    const patientRow = await patientRepo.findById(patientId);
    if (patientRow?.userId) {
      await participantRepo.create({ conversationId: row.id, userId: patientRow.userId });
    }
    if (assignedTo) {
      await participantRepo.create({ conversationId: row.id, userId: assignedTo });
    }

    return row;
  }

  // Patient role spec: side-effect reports carry a real, per-report fee paid upfront. Creates
  // a fresh SIDE_EFFECT_REPORT invoice, sends it, and attempts payment from the patient's
  // wallet in the same request — the conversation (and first message) only get created once
  // that payment actually succeeds. On insufficient balance, returns the unpaid (SENT) invoice
  // instead of throwing, so the caller can render the same Insufficient Balance state the
  // Wallet page already uses, with real numbers.
  async startSideEffectReport(patientId: string, message: string, callerId: string) {
    const isSelf = await callerOwnsPatient(callerId, patientId);
    if (!isSelf) {
      throw new ForbiddenError("You can only report a side effect for your own patient record");
    }

    // Server-side backstop for the same rule the frontend enforces: an OPEN report is still
    // live (follow-ups there are free) — a CLOSED one means the encounter is over and a new
    // report, with a new fee, is what's actually being started.
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

  async getConversation(id: string, callerId: string) {
    const row = await conversationRepo.findById(id);
    if (!row) throw new NotFoundError("Conversation not found");

    const isSelf = await callerOwnsPatient(callerId, row.patientId);
    if (!isSelf && !(await userHasPermission(callerId, "conversation", "read"))) {
      throw new ForbiddenError("Forbidden");
    }
    return new Conversation(row).toJSON();
  }

  async listByPatient(patientId: string, callerId: string) {
    const isSelf = await callerOwnsPatient(callerId, patientId);
    if (!isSelf && !(await userHasPermission(callerId, "conversation", "read"))) {
      throw new ForbiddenError("Forbidden");
    }
    const rows = await conversationRepo.findByPatient(patientId);
    // WhatsApp-style "delivered": the caller's client just fetched this list, so the other
    // party's messages in each of these conversations have now reached them.
    const patientRow = await patientRepo.findById(patientId);
    for (const row of rows) {
      await messageRepo.markDeliveredForViewer(row.id, patientRow?.userId ?? null, isSelf);
    }
    return withLastMessage(rows);
  }

  // Staff-only path (a patient never has a conversation "assigned" to them) — no ownership
  // branch, just the permission.
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

  // Stamps first_response_at exactly once, only for a real (non-SYSTEM) message, and only
  // the first one — everything downstream (SLA breach sweep) reads that single stamp.
  // senderId is deliberately NOT part of `data`: it is always the authenticated caller.
  // It used to be taken from the request body while only the *caller* was authorized against
  // the conversation, so any participant could post a message attributed to someone else —
  // a patient could store clinical advice under their doctor's name, and both the patient and
  // staff would see it rendered as having come from that doctor.
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
      // Only stamp when THIS message is the first real one — a later real message in the
      // same conversation must not re-stamp or overwrite the original first_response_at.
      if (existingRealMessage && existingRealMessage.id === messageRow.id) {
        await conversationRepo.update(data.conversationId, { firstResponseAt: messageRow.createdAt });
      }
    }

    const json = messageEntity.toJSON();
    // Only emits once a real Socket.IO server exists (attachSocketServer, index.ts) — never
    // attached in the test process, so this is a no-op there, not a thrown error.
    if (isIoAttached()) {
      getIo().to(`conversation:${data.conversationId}`).emit("message:new", json);
    }

    return json;
  }

  async listMessages(conversationId: string, callerId: string) {
    const conversationRow = await conversationRepo.findById(conversationId);
    if (!conversationRow) throw new NotFoundError("Conversation not found");

    const isSelf = await callerOwnsPatient(callerId, conversationRow.patientId);
    if (!isSelf && !(await userHasPermission(callerId, "message", "read"))) {
      throw new ForbiddenError("Forbidden");
    }

    // Lazy sweep, same "side effect of a read" precedent as markReadForViewer right below —
    // no scheduler/queue needed, any thread view is enough to catch every overdue conversation.
    await messagingJobService.sweepSlaBreaches().catch((err) => {
      console.error("SLA breach sweep failed:", err);
    });

    // WhatsApp-style "read": opening this specific thread is the read signal — mark the
    // other party's messages read before returning, so this same response reflects it.
    const patientRow = await patientRepo.findById(conversationRow.patientId);
    await messageRepo.markReadForViewer(conversationId, patientRow?.userId ?? null, isSelf);

    const rows = await messageRepo.findByConversation(conversationId);
    return rows.map((r) => new Message(r).toJSON());
  }

  // Either side can end a side-effect report: the patient (it's their own record) or staff
  // with conversation:update (typically the Virtual Medical Officer who handled it). Once
  // closed, postMessage rejects further replies and startSideEffectReport treats it as no
  // longer "open" — reopening isn't a thing; a new report is its own new invoice.
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

  // Mutual rating, submittable by either side once the encounter is over — rating an ongoing
  // conversation is premature, and each rater gets exactly one say (the unique index on
  // (conversationId, raterId) backs this up at the DB layer too).
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

    // Notify the other party — whoever didn't just submit this feedback. Best-effort, same
    // tolerance as every other notification hook in this codebase.
    const recipientId = isSelf ? row.assignedTo : (await patientRepo.findById(row.patientId))?.userId;
    if (recipientId) {
      await notificationService.create({ recipientId, type: "CONVERSATION_FEEDBACK" }).catch((err) => {
        console.error(`Feedback notification failed for conversation ${conversationId}:`, err);
      });
    }

    return new ConversationFeedback(feedbackRow).toJSON();
  }

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

// F3.11 (docs/build-plan/13-scribe-role-definition.md) — the shared transcription queue a
// Scribe claims work from, plus the finalization step that closes the "no downstream
// consumer" gap: completing an assignment IS finalizing the meeting's transcript, one action,
// not two steps a caller could get out of sync.
export class TranscriptionAssignmentService {
  // Triggered when a Meeting transitions to ENDED (see MeetingService.syncStatus below) —
  // "meeting ended, transcript ready for review." UNIQUE(meeting_id) plus Meeting's own
  // SCHEDULED/IN_PROGRESS -> ENDED (reachable exactly once) transition guard together make a
  // duplicate assignment for the same meeting structurally impossible, not just unlikely.
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

  async listQueue() {
    const rows = await transcriptionAssignmentRepo.findQueue();
    return rows.map((r) => new TranscriptionAssignment(r).toJSON());
  }

  async listMine(scribeId: string) {
    const rows = await transcriptionAssignmentRepo.findByScribe(scribeId);
    return rows.map((r) => new TranscriptionAssignment(r).toJSON());
  }

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

  // F3.11 §4 — completes the assignment AND sets Meeting.transcriptFinalizedAt/By in one call,
  // since the doc treats them as the same real-world event, not two steps.
  // Stage 1 of 2 (see Meeting.recordTranscriptCorrection/signOffTranscript) — this is the
  // Scribe's own work being finalized, NOT the transcript becoming trusted/citable. That's a
  // separate consultant sign-off action (MeetingService.signOffTranscript, below).
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

    // This is where a TranscriptReadyForSignOff event would notify the respective consultant
    // (the appointment's assigned oncologist — resolved via meetingRow.appointmentId) that
    // their sign-off is needed. src/modules/notification is still an empty scaffold (schema
    // only, no service/repository wired up yet) — same "no queue infra wired up yet" situation
    // already true of CountdownJobService/MessagingJobService, so this is a documented pending
    // hook, not a silently dropped requirement.

    return new TranscriptionAssignment(saved!).toJSON();
  }
}

const transcriptionAssignmentSvc = new TranscriptionAssignmentService();

// F3.7 — Daily.co room provisioning + webhook-driven status/transcript sync. Signature
// verification (DailyService.verifyDailyWebhookSignature) must run in the controller before
// either webhook handler here is ever called — these methods assume the request is already
// authenticated as genuinely from Daily.co, they don't re-verify it themselves.
export class MeetingService {
  // Two concurrent callers for the same appointment (React StrictMode's double-mount in dev,
  // a genuine double-click, or two tabs) both pass the findByAppointment check above before
  // either has inserted a row, then race on Daily's own room-name collision (a plain 400, not
  // a distinguishable "already exists" code) and the DB's own unique appointment_id constraint.
  // Rather than surfacing a false failure to whichever request loses the race, both failure
  // points re-check our own row and hand back the winner's meeting — this endpoint is meant to
  // be safely retryable, not a true create-or-conflict.
  // opts is set by the scheduling-time caller (appointment module's /consultations
  // orchestration) so the room's Daily-side expiry can be computed from the real appointment
  // window; omitted by the legacy lazy-provisioning path, which has no scheduled end to compute
  // it from.
  async provisionRoom(appointmentId: string, opts?: { scheduledAt: Date; durationMinutes: number }) {
    const existing = await meetingRepo.findByAppointment(appointmentId);
    if (existing) {
      throw new ConflictError("A meeting already exists for this appointment");
    }

    // 30-minute grace buffer past the appointment's own end, per the lifecycle doc §3 — enough
    // slack for a call that runs long without leaving the room joinable indefinitely.
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

  // Lets a patient join their own scheduled video consult without a blanket meeting:read
  // grant — ownership is resolved via the appointment's patientId, since Meeting itself has
  // no patientId (it only knows appointmentId).
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

  // Same ownership rule as getByAppointment (patient-self or a meeting:read grant) — this is
  // what lets Phase 4's Pre-call Briefing honestly know "has the patient's client actually
  // connected yet" instead of a clinician manually clicking through to the Room.
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

  // Decision 2 — role-scoped join tokens. isOwner is the appointment's own assigned oncologist
  // (or SUPER_ADMIN, same break-glass precedent as signOffTranscript); everyone else who's
  // allowed to join at all gets a plain participant token.
  //
  // ONCOFLOW_SCHEDULING_AND_VIDEO_LIFECYCLE.md §3: "must check participant membership, not just
  // role-permission" — a token is consequential (it's literally a room join credential), so this
  // deliberately does NOT fall back to a broad meeting:read grant the way getPresence/
  // getByAppointment still do for read-only visibility. Membership is either the fixed
  // oncologist/patient roles already on the appointment, or an explicit appointment_participant
  // row (Admin's New Consultation flow adds one per invited participant at scheduling time) —
  // this is what makes "only admin-selected participants can join" actually true.
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

  // The clinician's own "End Call" action (Phase 5) — a second, client-driven path to ENDED
  // alongside the webhook one below. Relying on the webhook alone means a dev environment with
  // no public URL for Daily to call back to (or a genuinely dropped webhook in prod) never
  // records endedAt, which would silently make Phase 6's post-consult SLA clock inert. Whoever
  // ends the call is an authoritative-enough signal on its own; idempotent if the webhook (or a
  // second click) already got there first.
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

  // §5 — Daily's recording webhook. Payload field names here are the best-effort read of
  // Daily's own recording-webhook docs, same caveat as verifyDailyWebhookSignature's own
  // comment: unverified against a real delivery (recording is gated behind
  // DAILY_ENABLE_RECORDING, off by default, and no recording has actually run in this
  // environment yet) — confirm exact field names against a real webhook before relying on this
  // in production. Upserts by dailyRecordingId so a "started" event followed by a
  // "ready-to-download" event for the same recording updates one row, not two.
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

  // Driven by Daily.co's meeting-status webhook — maps its event types to our own
  // SCHEDULED/IN_PROGRESS/ENDED status via the entity's own transition guard. Daily.co
  // identifies the meeting by room id in the webhook payload, not our own meeting.id.
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

  async listTranscript(meetingId: string) {
    const rows = await transcriptRepo.findByMeeting(meetingId);
    return rows.map((r) => new Transcript(r).toJSON());
  }

  // F3.11 — corrections are the Scribe's job, scoped to meetings they've actually claimed
  // from the queue ("own claims only" is a hard rule per the role definition, not incidental
  // scoping) — the one place in this module where a correction IS an in-place edit, not a new
  // row. SUPER_ADMIN bypasses the claim check, same break-glass precedent as requireRole().
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

  // Stage 2 of 2 — the respective consultant reviewing and signing off on a Scribe-corrected
  // transcript. "Respective consultant" means the appointment's own assigned oncologist, not
  // any consultant generally — enforced here (an ownership check), not in the entity, which
  // only knows the state-machine ordering rule (can't sign off before stage 1). SUPER_ADMIN
  // bypasses ownership, same break-glass precedent as editTranscriptEntry above.
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
