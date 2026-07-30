import crypto from "node:crypto";
import {
  ConversationRepository, ParticipantRepository, MessageRepository, MeetingRepository, TranscriptRepository,
  TranscriptionAssignmentRepository,
} from "./repository.js";
import { Conversation } from "./entities/Conversation.js";
import { Message } from "./entities/Message.js";
import { Meeting } from "./entities/Meeting.js";
import { Transcript } from "./entities/Transcript.js";
import { TranscriptionAssignment } from "./entities/TranscriptionAssignment.js";
import { createDailyRoom } from "./services/DailyService.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { userHasRole } from "../../lib/rbac.js";
import { PatientRepository } from "../patient/index.js";
import { AppointmentRepository } from "../appointment/index.js";
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
const appointmentRepo = new AppointmentRepository();

// F3.11 §5 — proposed default, not FR-pinned. A global constant for MVP; per-scribe override
// is a reasonable later enhancement, not worth building now (no evidence yet of scribes
// actually having different throughput).
const TRANSCRIPTION_BACKLOG_CAP = 5;

export class MessagingService {
  async startConversation(data: { patientId: string; conversationType: ConversationType; assignedTo?: string }) {
    const now = new Date();
    const row = await conversationRepo.create({
      id: crypto.randomUUID(),
      patientId: data.patientId,
      conversationType: data.conversationType,
      status: "OPEN",
      slaDeadline: Conversation.slaDeadlineFor(data.conversationType, now),
      assignedTo: data.assignedTo ?? null,
    });

    // participant.user_id references User, not Patient — a patient only gets a participant
    // row if they have a linked user account (patient.user_id is nullable; not every patient
    // record has self-service login set up yet). conversation.patient_id already establishes
    // the patient side unambiguously either way.
    const patientRow = await patientRepo.findById(data.patientId);
    if (patientRow?.userId) {
      await participantRepo.create({ conversationId: row.id, userId: patientRow.userId });
    }
    if (data.assignedTo) {
      await participantRepo.create({ conversationId: row.id, userId: data.assignedTo });
    }

    return new Conversation(row).toJSON();
  }

  async getConversation(id: string) {
    const row = await conversationRepo.findById(id);
    if (!row) throw new NotFoundError("Conversation not found");
    return new Conversation(row).toJSON();
  }

  async listByPatient(patientId: string) {
    const rows = await conversationRepo.findByPatient(patientId);
    return rows.map((r) => new Conversation(r).toJSON());
  }

  async listByAssignee(assignedTo: string) {
    const rows = await conversationRepo.findByAssignee(assignedTo);
    return rows.map((r) => new Conversation(r).toJSON());
  }

  // Stamps first_response_at exactly once, only for a real (non-SYSTEM) message, and only
  // the first one — everything downstream (SLA breach sweep) reads that single stamp.
  async postMessage(data: { conversationId: string; senderId: string; type: MessageType; content: string }) {
    const conversationRow = await conversationRepo.findById(data.conversationId);
    if (!conversationRow) throw new NotFoundError("Conversation not found");

    const messageRow = await messageRepo.create({
      id: crypto.randomUUID(),
      conversationId: data.conversationId,
      senderId: data.senderId,
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

    return messageEntity.toJSON();
  }

  async listMessages(conversationId: string) {
    const rows = await messageRepo.findByConversation(conversationId);
    return rows.map((r) => new Message(r).toJSON());
  }

  async closeConversation(id: string) {
    const row = await conversationRepo.findById(id);
    if (!row) throw new NotFoundError("Conversation not found");
    const updated = new Conversation(row).close();
    const saved = await conversationRepo.update(id, { status: updated.status });
    return new Conversation(saved!).toJSON();
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
  async provisionRoom(appointmentId: string) {
    const existing = await meetingRepo.findByAppointment(appointmentId);
    if (existing) {
      throw new ConflictError("A meeting already exists for this appointment");
    }

    const { roomId } = await createDailyRoom(`appointment-${appointmentId}`);

    const row = await meetingRepo.create({
      id: crypto.randomUUID(),
      appointmentId,
      provider: "daily.co",
      roomId,
      status: "SCHEDULED",
    });

    return new Meeting(row).toJSON();
  }

  async getByAppointment(appointmentId: string) {
    const row = await meetingRepo.findByAppointment(appointmentId);
    return row ? new Meeting(row).toJSON() : null;
  }

  // Driven by Daily.co's meeting-status webhook — maps its event types to our own
  // SCHEDULED/IN_PROGRESS/ENDED status via the entity's own transition guard. Daily.co
  // identifies the meeting by room id in the webhook payload, not our own meeting.id.
  async syncStatus(roomId: string, targetStatus: MeetingStatus) {
    const row = await meetingRepo.findByRoomId(roomId);
    if (!row) throw new NotFoundError("Meeting not found for this room");
    const updated = new Meeting(row).transitionTo(targetStatus);
    const saved = await meetingRepo.update(row.id, { status: updated.status });

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
