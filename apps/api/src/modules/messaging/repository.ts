import { db } from "../../db/index.js";
import { eq, ne, sql, and, isNull, lt, inArray, desc } from "drizzle-orm";
import {
  conversation, participant, message, meeting, transcript, transcriptionAssignment, conversationFeedback,
  meetingRecording,
} from "./schema.js";

// Data access for conversations.
export class ConversationRepository {
  // Finds a conversation by id.
  async findById(id: string) {
    const row = await db
      .select()
      .from(conversation)
      .where(sql`${conversation.id} = ${id} AND ${conversation.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  // Lists a patient's conversations.
  async findByPatient(patientId: string) {
    return db
      .select()
      .from(conversation)
      .where(and(eq(conversation.patientId, patientId), eq(conversation.isDeleted, false)))
      .orderBy(conversation.createdAt);
  }

  // Lists conversations assigned to a staff member.
  async findByAssignee(assignedTo: string) {
    return db
      .select()
      .from(conversation)
      .where(and(eq(conversation.assignedTo, assignedTo), eq(conversation.isDeleted, false)))
      .orderBy(conversation.slaDeadline);
  }

  // Open, unanswered conversations already past their SLA deadline, which the breach sweep flips.
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

  // Inserts a conversation.
  async create(data: typeof conversation.$inferInsert) {
    const row = await db.insert(conversation).values(data).returning();
    return row[0]!;
  }

  // Updates a conversation.
  async update(id: string, data: Partial<typeof conversation.$inferInsert>) {
    const row = await db
      .update(conversation)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(conversation.id, id), eq(conversation.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }
}

// Data access for conversation participants.
export class ParticipantRepository {
  // Lists a conversation's participants.
  async findByConversation(conversationId: string) {
    return db.select().from(participant).where(eq(participant.conversationId, conversationId));
  }

  // True when the user participates in the conversation.
  async isParticipant(conversationId: string, userId: string) {
    const row = await db
      .select()
      .from(participant)
      .where(and(eq(participant.conversationId, conversationId), eq(participant.userId, userId)))
      .limit(1);
    return row.length > 0;
  }

  // Adds a participant.
  async create(data: typeof participant.$inferInsert) {
    const row = await db.insert(participant).values(data).returning();
    return row[0]!;
  }
}

// Data access for messages.
export class MessageRepository {
  // Lists a conversation's messages.
  async findByConversation(conversationId: string) {
    return db
      .select()
      .from(message)
      .where(eq(message.conversationId, conversationId))
      .orderBy(message.createdAt);
  }

  // Latest message per conversation in one DISTINCT ON query to avoid an N+1; the ORDER BY must lead with conversation_id.
  async findLatestByConversations(conversationIds: string[]) {
    if (conversationIds.length === 0) return [];
    return db
      .selectDistinctOn([message.conversationId])
      .from(message)
      .where(inArray(message.conversationId, conversationIds))
      .orderBy(message.conversationId, desc(message.createdAt));
  }

  // First non-SYSTEM message, used to decide whether a new message should stamp first_response_at.
  async findFirstRealMessage(conversationId: string) {
    const row = await db
      .select()
      .from(message)
      .where(and(eq(message.conversationId, conversationId), sql`${message.type} != 'SYSTEM'`))
      .orderBy(message.createdAt)
      .limit(1);
    return row[0] ?? null;
  }

  // Content is append-only: the delivery and read methods below only change status, never content.

  // WhatsApp-style delivery: marks the other party's messages delivered when this viewer fetches the list.
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

  // Inserts a message.
  async create(data: typeof message.$inferInsert) {
    const row = await db.insert(message).values(data).returning();
    return row[0]!;
  }
}

// Data access for meetings.
export class MeetingRepository {
  // Finds a meeting by id.
  async findById(id: string) {
    const row = await db.select().from(meeting).where(eq(meeting.id, id)).limit(1);
    return row[0] ?? null;
  }

  // UNIQUE(appointment_id) — at most one meeting per appointment.
  async findByAppointment(appointmentId: string) {
    const row = await db.select().from(meeting).where(eq(meeting.appointmentId, appointmentId)).limit(1);
    return row[0] ?? null;
  }

  // Daily webhooks identify meetings by room id, not our meeting.id.
  async findByRoomId(roomId: string) {
    const row = await db.select().from(meeting).where(eq(meeting.roomId, roomId)).limit(1);
    return row[0] ?? null;
  }

  // Inserts a meeting.
  async create(data: typeof meeting.$inferInsert) {
    const row = await db.insert(meeting).values(data).returning();
    return row[0]!;
  }

  // Updates a meeting.
  async update(id: string, data: Partial<typeof meeting.$inferInsert>) {
    const row = await db
      .update(meeting)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(meeting.id, id))
      .returning();
    return row[0] ?? null;
  }
}

// Data access for meeting recordings.
export class MeetingRecordingRepository {
  // Finds a recording by Daily's recording id.
  async findByDailyId(dailyRecordingId: string) {
    const row = await db.select().from(meetingRecording).where(eq(meetingRecording.dailyRecordingId, dailyRecordingId)).limit(1);
    return row[0] ?? null;
  }

  // Lists a meeting's recordings.
  async findByMeeting(meetingId: string) {
    return db.select().from(meetingRecording).where(eq(meetingRecording.meetingId, meetingId)).orderBy(desc(meetingRecording.createdAt));
  }

  // Inserts a recording.
  async create(data: typeof meetingRecording.$inferInsert) {
    const row = await db.insert(meetingRecording).values(data).returning();
    return row[0]!;
  }

  // Updates a recording.
  async update(id: string, data: Partial<typeof meetingRecording.$inferInsert>) {
    const row = await db.update(meetingRecording).set(data).where(eq(meetingRecording.id, id)).returning();
    return row[0] ?? null;
  }
}

// Data access for transcript segments.
export class TranscriptRepository {
  // Finds a transcript segment by id.
  async findById(id: string) {
    const row = await db.select().from(transcript).where(eq(transcript.id, id)).limit(1);
    return row[0] ?? null;
  }

  // Lists a meeting's transcript segments.
  async findByMeeting(meetingId: string) {
    return db.select().from(transcript).where(eq(transcript.meetingId, meetingId)).orderBy(transcript.createdAt);
  }

  // Inserts a transcript segment.
  async create(data: typeof transcript.$inferInsert) {
    const row = await db.insert(transcript).values(data).returning();
    return row[0]!;
  }

  // Not append-only: post-hoc inline correction is the actual F3.7 feature.
  async update(id: string, data: Partial<typeof transcript.$inferInsert>) {
    const row = await db.update(transcript).set(data).where(eq(transcript.id, id)).returning();
    return row[0] ?? null;
  }
}

// Data access for transcription assignments.
export class TranscriptionAssignmentRepository {
  // Finds an assignment by id.
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

  // Lists a scribe's assignments.
  async findByScribe(scribeId: string) {
    return db
      .select()
      .from(transcriptionAssignment)
      .where(eq(transcriptionAssignment.scribeId, scribeId))
      .orderBy(transcriptionAssignment.queuedAt);
  }

  // Only CLAIMED and IN_PROGRESS count against a scribe's backlog cap.
  async countActiveForScribe(scribeId: string): Promise<number> {
    const row = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text AS count
      FROM transcription_assignment
      WHERE scribe_id = ${scribeId} AND status IN ('CLAIMED', 'IN_PROGRESS')
    `);
    return Number(row[0]?.count ?? 0);
  }

  // Uncompleted assignments past their SLA deadline; an unclaimed item still breaches 24h after queuing.
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

  // Inserts an assignment.
  async create(data: typeof transcriptionAssignment.$inferInsert) {
    const row = await db.insert(transcriptionAssignment).values(data).returning();
    return row[0]!;
  }

  // Updates an assignment.
  async update(id: string, data: Partial<typeof transcriptionAssignment.$inferInsert>) {
    const row = await db
      .update(transcriptionAssignment)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(transcriptionAssignment.id, id))
      .returning();
    return row[0] ?? null;
  }
}

// Data access for conversation feedback.
export class ConversationFeedbackRepository {
  // Lists a conversation's feedback.
  async findByConversation(conversationId: string) {
    return db.select().from(conversationFeedback).where(eq(conversationFeedback.conversationId, conversationId));
  }

  // Finds the feedback a given rater left on a conversation.
  async findByConversationAndRater(conversationId: string, raterId: string) {
    const row = await db
      .select()
      .from(conversationFeedback)
      .where(and(eq(conversationFeedback.conversationId, conversationId), eq(conversationFeedback.raterId, raterId)))
      .limit(1);
    return row[0] ?? null;
  }

  // Inserts feedback.
  async create(data: typeof conversationFeedback.$inferInsert) {
    const row = await db.insert(conversationFeedback).values(data).returning();
    return row[0]!;
  }
}
