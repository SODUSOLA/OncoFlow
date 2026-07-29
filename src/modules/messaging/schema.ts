import {
  pgTable, uuid, varchar, text, boolean, timestamp, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import {
  conversationTypeEnum, conversationStatusEnum, messageTypeEnum, messageStatusEnum, meetingStatusEnum,
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

export const meeting = pgTable("meeting", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentId: uuid("appointment_id").notNull().references(() => appointment.id),
  provider: varchar("provider", { length: 100 }).notNull(),
  roomId: varchar("room_id", { length: 255 }).notNull(),
  status: meetingStatusEnum("status").notNull().default("SCHEDULED"),
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