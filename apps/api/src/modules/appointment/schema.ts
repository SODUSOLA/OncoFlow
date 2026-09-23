import {
  pgTable, uuid, varchar, boolean, timestamp, index, integer,
} from "drizzle-orm/pg-core";
import { appointmentTypeEnum, appointmentStatusEnum, transferStatusEnum } from "../../db/enums.js";
import { patient } from "../patient/schema.js";
import { user } from "../auth/schema.js";
import { facility } from "../facility/schema.js";

export const appointment = pgTable("appointment", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  oncologistId: uuid("oncologist_id").references(() => user.id),
  facilityId: uuid("facility_id").notNull().references(() => facility.id),
  appointmentType: appointmentTypeEnum("appointment_type").notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  // Nullable rather than backfilled: older appointments honestly have no stated duration, which isn't zero.
  durationMinutes: integer("duration_minutes"),
  status: appointmentStatusEnum("status").notNull().default("PENDING"),
  meetingId: uuid("meeting_id"),
  paymentConfirmedAt: timestamp("payment_confirmed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  patientIdx: index("appointment_patient_idx").on(t.patientId),
  facilityScheduledIdx: index("appointment_facility_scheduled_idx").on(t.facilityId, t.scheduledAt),
  statusIdx: index("appointment_status_idx").on(t.status),
}));

export const appointmentParticipant = pgTable("appointment_participant", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentId: uuid("appointment_id").notNull().references(() => appointment.id),
  userId: uuid("user_id").notNull().references(() => user.id),
  role: varchar("role", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const transferRequest = pgTable("transfer_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  fromFacilityId: uuid("from_facility_id").notNull().references(() => facility.id),
  toFacilityId: uuid("to_facility_id").notNull().references(() => facility.id),
  requestedBy: uuid("requested_by").notNull().references(() => user.id),
  approvedBy: uuid("approved_by").references(() => user.id),
  status: transferStatusEnum("status").notNull().default("PENDING"),
  routedAt: timestamp("routed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
});