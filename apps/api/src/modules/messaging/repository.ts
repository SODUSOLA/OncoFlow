import { db } from "../../db/index.js";
import { eq, ne, sql, and, isNull, lt, inArray, desc } from "drizzle-orm";
import {
  conversation, participant, message, meeting, transcript, transcriptionAssignment, conversationFeedback,
} from "./schema.js";

export class ConversationRepository {
  async findById(id: string) {
    const row = await db
      .select()
      .from(conversation)
      .where(sql`${conversation.id} = ${id} AND ${conversation.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  async findByPatient(patientId: string) {
    return db
      .select()
      .from(conversation)
      .where(and(eq(conversation.patientId, patientId), eq(conversation.isDeleted, false)))
      .orderBy(conversation.createdAt);
  }

  async findByAssignee(assignedTo: string) {
    return db
      .select()
      .from(conversation)
      .where(and(eq(conversation.assignedTo, assignedTo), eq(conversation.isDeleted, false)))
      .orderBy(conversation.slaDeadline);
  }

  // Open, unbreached, unanswered, deadline already passed — exactly what the SLA-breach
  // sweep (MessagingJobService) needs to find and flip.
  async findOverdueUnbreached() {
    return db
      .select()
      .from(conversation)
      .where(and(
        eq(conversation.status, "OPEN"),
        eq(conversation.slaBreached, false),
        isNull(conversation.firstResponseAt),
        lt(conversation.slaDeadline, new Date()),
        eq(conversation.isDeleted, false),
      ));
  }

  async create(data: typeof conversation.$inferInsert) {
    const row = await db.insert(conversation).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof conversation.$inferInsert>) {
    const row = await db
      .update(conversation)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(conversation.id, id), eq(conversation.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }
}

export class ParticipantRepository {
  async findByConversation(conversationId: string) {
    return db.select().from(participant).where(eq(participant.conversationId, conversationId));
  }

  async isParticipant(conversationId: string, userId: string) {
    const row = await db
      .select()
      .from(participant)
      .where(and(eq(participant.conversationId, conversationId), eq(participant.userId, userId)))
      .limit(1);
    return row.length > 0;
  }

  async create(data: typeof participant.$inferInsert) {
    const row = await db.insert(participant).values(data).returning();
    return row[0]!;
  }
}

export class MessageRepository {
  async findByConversation(conversationId: string) {
    return db
      .select()
      .from(message)
      .where(eq(message.conversationId, conversationId))
      .orderBy(message.createdAt);
  }

  // Latest message for each of several conversations, in one query rather than one per
  // conversation — this feeds the conversation list, so a per-row lookup would be an N+1 that
  // grows with the number of threads a patient has.
  //
  // DISTINCT ON is Postgres-specific and needs its ORDER BY to lead with the same expression,
  // hence ordering by conversation_id first and only then by recency.
  async findLatestByConversations(conversationIds: string[]) {
    if (conversationIds.length === 0) return [];
    return db
      .selectDistinctOn([message.conversationId])
      .from(message)
      .where(inArray(message.conversationId, conversationIds))
      .orderBy(message.conversationId, desc(message.createdAt));
  }

  // First non-SYSTEM message in the conversation, if any — used to determine whether this
  // new message is the one that should stamp first_response_at.
  async findFirstRealMessage(conversationId: string) {
    const row = await db
      .select()
      .from(message)
      .where(and(eq(message.conversationId, conversationId), sql`${message.type} != 'SYSTEM'`))
      .orderBy(message.createdAt)
      .limit(1);
    return row[0] ?? null;
  }

  // [append-only for content] — the two methods below only ever touch `status`, never
  // `content`; a correction is still a new message, never an edit of an existing one.

  // WhatsApp-style delivery: fires when the OTHER party's client fetches the conversation
  // list, i.e. their app now knows this message exists. viewerIsPatient picks which side's
  // messages count as "the other party" — a patient viewer delivers staff messages, a staff
  // viewer delivers the patient's messages.
  async markDeliveredForViewer(conversationId: string, patientUserId: string | null, viewerIsPatient: boolean) {
    if (!patientUserId) return;
    const senderMatch = viewerIsPatient ? ne(message.senderId, patientUserId) : eq(message.senderId, patientUserId);
    await db
      .update(message)
      .set({ status: "DELIVERED" })
      .where(and(eq(message.conversationId, conversationId), eq(message.status, "SENT"), senderMatch));
  }

  // WhatsApp-style read receipt: fires when the OTHER party opens this specific thread.
  async markReadForViewer(conversationId: string, patientUserId: string | null, viewerIsPatient: boolean) {
    if (!patientUserId) return;
    const senderMatch = viewerIsPatient ? ne(message.senderId, patientUserId) : eq(message.senderId, patientUserId);
    await db
      .update(message)
      .set({ status: "READ" })
      .where(and(eq(message.conversationId, conversationId), ne(message.status, "READ"), senderMatch));
  }

  async create(data: typeof message.$inferInsert) {
    const row = await db.insert(message).values(data).returning();
    return row[0]!;
  }
}

export class MeetingRepository {
  async findById(id: string) {
    const row = await db.select().from(meeting).where(eq(meeting.id, id)).limit(1);
    return row[0] ?? null;
  }

  // UNIQUE(appointment_id) — at most one meeting per appointment.
  async findByAppointment(appointmentId: string) {
    const row = await db.select().from(meeting).where(eq(meeting.appointmentId, appointmentId)).limit(1);
    return row[0] ?? null;
  }

  // Daily.co's webhooks identify a meeting by room name/id, not our own meeting.id — this
  // is how the webhook handlers (MeetingService.syncStatus) look the row up.
  async findByRoomId(roomId: string) {
    const row = await db.select().from(meeting).where(eq(meeting.roomId, roomId)).limit(1);
    return row[0] ?? null;
  }

  async create(data: typeof meeting.$inferInsert) {
    const row = await db.insert(meeting).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof meeting.$inferInsert>) {
    const row = await db
      .update(meeting)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(meeting.id, id))
      .returning();
    return row[0] ?? null;
  }
}

export class TranscriptRepository {
  async findById(id: string) {
    const row = await db.select().from(transcript).where(eq(transcript.id, id)).limit(1);
    return row[0] ?? null;
  }

  async findByMeeting(meetingId: string) {
    return db.select().from(transcript).where(eq(transcript.meetingId, meetingId)).orderBy(transcript.createdAt);
  }

  async create(data: typeof transcript.$inferInsert) {
    const row = await db.insert(transcript).values(data).returning();
    return row[0]!;
  }

  // Not append-only — post-hoc correction is the actual F3.7 feature (Oncologist editing
  // the transcript inline during/after the call), not an in-place-edit anti-pattern.
  async update(id: string, data: Partial<typeof transcript.$inferInsert>) {
    const row = await db.update(transcript).set(data).where(eq(transcript.id, id)).returning();
    return row[0] ?? null;
  }
}

export class TranscriptionAssignmentRepository {
  async findById(id: string) {
    const row = await db.select().from(transcriptionAssignment).where(eq(transcriptionAssignment.id, id)).limit(1);
    return row[0] ?? null;
  }

  // UNIQUE(meeting_id) — at most one assignment per meeting.
  async findByMeeting(meetingId: string) {
    const row = await db
      .select()
      .from(transcriptionAssignment)
      .where(eq(transcriptionAssignment.meetingId, meetingId))
      .limit(1);
    return row[0] ?? null;
  }

  // Items available to be claimed — QUEUED (never claimed) or RELEASED (claimed, then given back).
  async findQueue() {
    return db
      .select()
      .from(transcriptionAssignment)
      .where(sql`${transcriptionAssignment.status} IN ('QUEUED', 'RELEASED')`)
      .orderBy(transcriptionAssignment.queuedAt);
  }

  async findByScribe(scribeId: string) {
    return db
      .select()
      .from(transcriptionAssignment)
      .where(eq(transcriptionAssignment.scribeId, scribeId))
      .orderBy(transcriptionAssignment.queuedAt);
  }

  // Backlog cap (F3.11 §5): only CLAIMED/IN_PROGRESS count against a scribe's cap — QUEUED
  // items have no scribeId yet, COMPLETED/RELEASED are no longer theirs to work on.
  async countActiveForScribe(scribeId: string): Promise<number> {
    const row = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text AS count
      FROM transcription_assignment
      WHERE scribe_id = ${scribeId} AND status IN ('CLAIMED', 'IN_PROGRESS')
    `);
    return Number(row[0]?.count ?? 0);
  }

  // "no completedAt" is the only resolution condition the SLA cares about (F3.11 §5, mirrors
  // Conversation.findOverdueUnbreached) — an item nobody ever claims still breaches its
  // 24h-from-queuedAt deadline, same as a claimed-but-unfinished one.
  async findOverdueUnbreached() {
    return db
      .select()
      .from(transcriptionAssignment)
      .where(and(
        eq(transcriptionAssignment.slaBreached, false),
        isNull(transcriptionAssignment.completedAt),
        lt(transcriptionAssignment.slaDeadline, new Date()),
      ));
  }

  async create(data: typeof transcriptionAssignment.$inferInsert) {
    const row = await db.insert(transcriptionAssignment).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof transcriptionAssignment.$inferInsert>) {
    const row = await db
      .update(transcriptionAssignment)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(transcriptionAssignment.id, id))
      .returning();
    return row[0] ?? null;
  }
}

export class ConversationFeedbackRepository {
  async findByConversation(conversationId: string) {
    return db.select().from(conversationFeedback).where(eq(conversationFeedback.conversationId, conversationId));
  }

  async findByConversationAndRater(conversationId: string, raterId: string) {
    const row = await db
      .select()
      .from(conversationFeedback)
      .where(and(eq(conversationFeedback.conversationId, conversationId), eq(conversationFeedback.raterId, raterId)))
      .limit(1);
    return row[0] ?? null;
  }

  async create(data: typeof conversationFeedback.$inferInsert) {
    const row = await db.insert(conversationFeedback).values(data).returning();
    return row[0]!;
  }
}
