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

  // Takes an unclaimed open side-effect chat for a VMO. The UPDATE only matches while nobody holds it, so two VMOs
  // claiming at once can never both win; null means it was already taken, closed, or isn't a side-effect chat.
  async claimSideEffect(id: string, vmoId: string) {
    const rows = await db
      .update(conversation)
      .set({ assignedTo: vmoId, updatedAt: new Date() })
      .where(and(
        eq(conversation.id, id),
        isNull(conversation.assignedTo),
        eq(conversation.status, "OPEN"),
        sql`${conversation.conversationType}::text = 'MO_SIDE_EFFECT'`,
        eq(conversation.isDeleted, false),
      ))
      .returning();
    return rows[0] ?? null;
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

  // Unread messages per conversation from the viewer's point of view: the other side's messages not yet marked read.
  // Raw SQL because it needs the patient's user id, which lives in another module's table.
  async countUnread(conversationIds: string[], viewerIsPatient: boolean): Promise<Map<string, number>> {
    if (conversationIds.length === 0) return new Map();
    const fromOtherSide = viewerIsPatient
      ? sql`m.sender_id IS DISTINCT FROM p.user_id`
      : sql`m.sender_id = p.user_id`;
    const rows = await db.execute<{ conversationId: string; n: number }>(sql`
      SELECT m.conversation_id AS "conversationId", COUNT(*)::int AS n
      FROM message m
      JOIN conversation c ON c.id = m.conversation_id
      JOIN patient p ON p.id = c.patient_id
      WHERE m.conversation_id IN (${sql.join(conversationIds.map((id) => sql`${id}::uuid`), sql`, `)})
        AND m.status::text <> 'READ' AND m.type::text <> 'SYSTEM' AND ${fromOtherSide}
      GROUP BY m.conversation_id
    `);
    return new Map(rows.map((r) => [r.conversationId, r.n]));
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

// Raw SQL hands the zone-less UTC timestamp columns back as bare strings that `new Date()` would read as local time.
function asUtc(v: Date | string): Date {
  if (v instanceof Date) return v;
  return new Date(/[zZ]|[+-]\d\d(:?\d\d)?$/.test(v) ? v : `${v.replace(" ", "T")}Z`);
}

export type AdminInquiryRow = {
  id: string;
  status: string;
  createdAt: Date;
  slaDeadline: Date | null;
  slaBreached: boolean;
  patientId: string;
  patientUserId: string | null;
  firstName: string;
  lastName: string;
  uniquePatientId: string;
  facilityId: string;
  lastMessage: string | null;
  lastMessageType: string | null;
  lastMessageAt: Date | null;
  lastMessageFromPatient: boolean | null;
  unreadCount: number;
};

// Raw SQL for the joins across patient, facility, user and role, which the module boundary rules keep out of drizzle here.
// Staff routing: who should hear about a patient's message, and the patient inquiries a Regional Admin may work.
export class StaffRoutingRepository {
  // Active Regional Admins whose region is the patient's facility's region.
  async regionalAdminIdsForPatient(patientId: string): Promise<string[]> {
    const rows = await db.execute<{ id: string }>(sql`
      SELECT DISTINCT u.id
      FROM "user" u
      JOIN user_role ur ON ur.user_id = u.id
      JOIN role r ON r.id = ur.role_id
      JOIN facility uf ON uf.id = u.facility_id
      WHERE r.name::text = 'REGIONAL_ADMIN' AND u.status::text = 'ACTIVE'
        AND uf.region = (SELECT pf.region FROM patient p JOIN facility pf ON pf.id = p.facility_id WHERE p.id = ${patientId})
    `);
    return rows.map((r) => r.id);
  }

  // Every active Virtual Medical Officer: a new side-effect report goes to all of them until one claims it.
  async activeVmoIds(): Promise<string[]> {
    const rows = await db.execute<{ id: string }>(sql`
      SELECT DISTINCT u.id
      FROM "user" u
      JOIN user_role ur ON ur.user_id = u.id
      JOIN role r ON r.id = ur.role_id
      WHERE r.name::text = 'VIRTUAL_MEDICAL_OFFICER' AND u.status::text = 'ACTIVE'
    `);
    return rows.map((r) => r.id);
  }

  // Patient admin-inquiry conversations for the given facilities (null = unrestricted), with the patient card and last message.
  async listAdminInquiries(facilityIds: string[] | null, status: "OPEN" | "CLOSED"): Promise<AdminInquiryRow[]> {
    if (facilityIds && facilityIds.length === 0) return [];
    const scope = facilityIds ? sql`AND p.facility_id IN (${sql.join(facilityIds.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``;
    const rows = await db.execute<AdminInquiryRow>(sql`
      SELECT c.id, c.status::text AS status, c.created_at AS "createdAt", c.sla_deadline AS "slaDeadline", c.sla_breached AS "slaBreached",
             p.id AS "patientId", p.user_id AS "patientUserId", p.first_name AS "firstName", p.last_name AS "lastName",
             p.unique_patient_id AS "uniquePatientId", p.facility_id AS "facilityId",
             lm.content AS "lastMessage", lm.type::text AS "lastMessageType", lm.created_at AS "lastMessageAt",
             (lm.sender_id = p.user_id) AS "lastMessageFromPatient",
             (SELECT COUNT(*)::int FROM message mu WHERE mu.conversation_id = c.id AND mu.sender_id = p.user_id
                AND mu.status::text <> 'READ' AND mu.type::text <> 'SYSTEM') AS "unreadCount"
      FROM conversation c
      JOIN patient p ON p.id = c.patient_id
      LEFT JOIN LATERAL (
        SELECT m.content, m.type, m.created_at, m.sender_id FROM message m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
      ) lm ON true
      WHERE c.is_deleted = false AND p.is_deleted = false AND c.conversation_type::text = 'ADMIN_INQUIRY' AND c.status::text = ${status} ${scope}
      ORDER BY COALESCE(lm.created_at, c.created_at) DESC
      LIMIT 200
    `);
    return [...rows].map((r) => ({
      ...r,
      createdAt: asUtc(r.createdAt),
      slaDeadline: r.slaDeadline ? asUtc(r.slaDeadline) : null,
      lastMessageAt: r.lastMessageAt ? asUtc(r.lastMessageAt) : null,
    }));
  }
}
