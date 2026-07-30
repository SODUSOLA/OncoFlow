import { db } from "../../db/index.js";
import { eq, sql, and, isNull, lt } from "drizzle-orm";
import { conversation, participant, message, meeting, transcript, transcriptionAssignment } from "./schema.js";

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

  // [append-only] — no update()/delete() methods; a correction is a new message, never an edit.
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
