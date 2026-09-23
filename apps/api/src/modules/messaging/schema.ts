import {
  pgTable, uuid, varchar, text, boolean, timestamp, uniqueIndex, index, smallint, integer,
} from "drizzle-orm/pg-core";
import {
  conversationTypeEnum, conversationStatusEnum, messageTypeEnum, messageStatusEnum, meetingStatusEnum,
  transcriptionAssignmentStatusEnum, conversationFeedbackRaterRoleEnum, meetingRecordingStatusEnum,
} from "../../db/enums.js";
import { patient } from "../patient/schema.js";
import { user } from "../auth/schema.js";
import { appointment } from "../appointment/schema.js";

export const conversation = pgTable("conversation", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  conversationType: conversationTypeEnum("conversation_type").notNull(),
  status: conversationStatusEnum("status").notNull().default("OPEN"),
  slaDeadline: timestamp("sla_deadline"),
  firstResponseAt: timestamp("first_response_at"),
  slaBreached: boolean("sla_breached").notNull().default(false),
  assignedTo: uuid("assigned_to").references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  assignedSlaIdx: index("conversation_assigned_sla_idx").on(t.assignedTo, t.slaDeadline),
}));

export const participant = pgTable("participant", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversation.id),
  userId: uuid("user_id").notNull().references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const message = pgTable("message", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversation.id),
  senderId: uuid("sender_id").notNull().references(() => user.id),
  type: messageTypeEnum("type").notNull(),
  content: text("content").notNull(),
  status: messageStatusEnum("status").notNull().default("SENT"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One row per rater per conversation, submitted only once CLOSED, since patient and staff ratings are independent.
export const conversationFeedback = pgTable("conversation_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversation.id),
  raterId: uuid("rater_id").notNull().references(() => user.id),
  raterRole: conversationFeedbackRaterRoleEnum("rater_role").notNull(),
  rating: smallint("rating").notNull(),
  review: text("review"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  conversationRaterUnique: uniqueIndex("conversation_feedback_conversation_rater_unique").on(t.conversationId, t.raterId),
}));

export const meeting = pgTable("meeting", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentId: uuid("appointment_id").notNull().references(() => appointment.id),
  provider: varchar("provider", { length: 100 }).notNull(),
  roomId: varchar("room_id", { length: 255 }).notNull(),
  status: meetingStatusEnum("status").notNull().default("SCHEDULED"),
  // Set once by MeetingService.syncStatus when Daily reports ENDED, as the honest end time the post-consult SLA is measured against.
  endedAt: timestamp("ended_at"),
  // Mirrors Daily's own room expiry for display only; null for legacy lazily provisioned rooms.
  dailyRoomExp: timestamp("daily_room_exp"),
  // F3.11 stage 1 of the two-stage sign-off (mirrors ADR-0012), on Meeting since review state is per meeting.
  transcriptCorrectedAt: timestamp("transcript_corrected_at"),
  transcriptCorrectedBy: uuid("transcript_corrected_by").references(() => user.id),
  // Stage 2: the assigned consultant's sign-off, which makes the transcript citable from a ClinicalNote.
  transcriptSignedOffAt: timestamp("transcript_signed_off_at"),
  transcriptSignedOffBy: uuid("transcript_signed_off_by").references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  appointmentIdUnique: uniqueIndex("meeting_appointment_id_unique").on(t.appointmentId),
}));

// Tracks Daily's own cloud recording, written by the recording webhook since Daily only knows a recording exists once the call produces one.
export const meetingRecording = pgTable("meeting_recording", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").notNull().references(() => meeting.id),
  dailyRecordingId: varchar("daily_recording_id", { length: 255 }).notNull(),
  downloadUrl: text("download_url"),
  durationSeconds: integer("duration_seconds"),
  status: meetingRecordingStatusEnum("status").notNull().default("PROCESSING"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  dailyRecordingIdUnique: uniqueIndex("meeting_recording_daily_id_unique").on(t.dailyRecordingId),
}));

export const transcript = pgTable("transcript", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").notNull().references(() => meeting.id),
  speaker: varchar("speaker", { length: 100 }).notNull(),
  content: text("content").notNull(),
  editedBy: uuid("edited_by").references(() => user.id),
  editedAt: timestamp("edited_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Its own aggregate rather than fields on Transcript or Meeting, since assignment workflow is separate from transcript content.
export const transcriptionAssignment = pgTable("transcription_assignment", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").notNull().references(() => meeting.id),
  scribeId: uuid("scribe_id").references(() => user.id),
  status: transcriptionAssignmentStatusEnum("status").notNull().default("QUEUED"),
  queuedAt: timestamp("queued_at").notNull().defaultNow(),
  claimedAt: timestamp("claimed_at"),
  completedAt: timestamp("completed_at"),
  slaDeadline: timestamp("sla_deadline"),
  slaBreached: boolean("sla_breached").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  meetingIdUnique: uniqueIndex("transcription_assignment_meeting_id_unique").on(t.meetingId),
  scribeStatusIdx: index("transcription_assignment_scribe_status_idx").on(t.scribeId, t.status),
  slaIdx: index("transcription_assignment_sla_idx").on(t.slaDeadline),
}));