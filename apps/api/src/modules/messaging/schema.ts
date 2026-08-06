import {
  pgTable, uuid, varchar, text, boolean, timestamp, uniqueIndex, index, smallint,
} from "drizzle-orm/pg-core";
import {
  conversationTypeEnum, conversationStatusEnum, messageTypeEnum, messageStatusEnum, meetingStatusEnum,
  transcriptionAssignmentStatusEnum, conversationFeedbackRaterRoleEnum,
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

// One row per rater per conversation — a patient's rating of the care they received and a
// staff member's rating of the encounter are independent perspectives, not one shared score.
// Only submittable once the conversation is CLOSED (rating an ongoing interaction is premature).
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
  // F3.11 two-stage sign-off, mirrors ClinicalDecision's qa_*/director_* pattern (ADR-0012).
  // Lives on Meeting (not per Transcript row) because "has this meeting's transcript been
  // reviewed" is a meeting-level state, and a meeting typically has many transcript segments.
  // Stage 1: the Scribe completing corrections on every segment.
  transcriptCorrectedAt: timestamp("transcript_corrected_at"),
  transcriptCorrectedBy: uuid("transcript_corrected_by").references(() => user.id),
  // Stage 2: the respective consultant (the appointment's assigned oncologist) signing off —
  // this, not stage 1, is what makes the transcript eligible to be referenced from a
  // ClinicalNote (Sprint 4).
  transcriptSignedOffAt: timestamp("transcript_signed_off_at"),
  transcriptSignedOffBy: uuid("transcript_signed_off_by").references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  appointmentIdUnique: uniqueIndex("meeting_appointment_id_unique").on(t.appointmentId),
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

// F3.11 (docs/build-plan/13-scribe-role-definition.md §3) — deliberately its own aggregate,
// not fields bolted onto Transcript or Meeting: assignment/workflow state (who's working on
// it, by when) is a different concern from the transcript content itself, same reasoning as
// keeping Transcript separate from Meeting.
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