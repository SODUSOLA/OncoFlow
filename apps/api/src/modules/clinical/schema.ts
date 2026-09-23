import {
  pgTable, uuid, varchar, text, date, integer, boolean, timestamp, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import {
  countdownStatusEnum, physicalCaseTypeEnum, physicalCaseStatusEnum, appointmentCardStatusEnum,
  treatmentStatusEnum, labRequestStatusEnum, clinicalDecisionEnum, prescriptionStatusEnum,
} from "../../db/enums.js";
import { user } from "../auth/schema.js";
import { patient } from "../patient/schema.js";
import { appointment } from "../appointment/schema.js";
import { conversation, meeting } from "../messaging/schema.js";
import { file } from "../documents/schema.js";
import { invoice } from "../billing/schema.js";

export const countdownCase = pgTable("countdown_case", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  currentDay: integer("current_day").notNull(),
  status: countdownStatusEnum("status").notNull().default("ACTIVE"),
  labsPromptedAt: timestamp("labs_prompted_at"),
  labsUploadedAt: timestamp("labs_uploaded_at"),
  resultsSentToQaAt: timestamp("results_sent_to_qa_at"),
  clinicalDecisionId: uuid("clinical_decision_id").references(() => clinicalDecision.id),
  invoiceId: uuid("invoice_id").references(() => invoice.id),
  paymentConfirmedAt: timestamp("payment_confirmed_at"),
  reminderSentAt: timestamp("reminder_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  patientStatusIdx: index("countdown_case_patient_status_idx").on(t.patientId, t.status),
  currentDayIdx: index("countdown_case_current_day_idx").on(t.currentDay),
  invoiceIdUnique: uniqueIndex("countdown_case_invoice_id_unique").on(t.invoiceId),
}));

export const physicalCase = pgTable("physical_case", {
  id: uuid("id").primaryKey().defaultRandom(),
  countdownCaseId: uuid("countdown_case_id").references(() => countdownCase.id),
  appointmentId: uuid("appointment_id").notNull().references(() => appointment.id),
  openedBy: uuid("opened_by").notNull().references(() => user.id),
  openedAt: timestamp("opened_at"),
  caseType: physicalCaseTypeEnum("case_type").notNull(),
  closedBy: uuid("closed_by").references(() => user.id),
  closedAt: timestamp("closed_at"),
  status: physicalCaseStatusEnum("status").notNull().default("OPEN"),
  doctorNoteReviewedAt: timestamp("doctor_note_reviewed_at"),
  appointmentCardReviewedAt: timestamp("appointment_card_reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  countdownCaseIdUnique: uniqueIndex("physical_case_countdown_case_id_unique").on(t.countdownCaseId),
  appointmentIdUnique: uniqueIndex("physical_case_appointment_id_unique").on(t.appointmentId),
  statusIdx: index("physical_case_status_idx").on(t.status),
}));

export const treatmentCycle = pgTable("treatment_cycle", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  cycleNumber: integer("cycle_number").notNull(),
  status: treatmentStatusEnum("status").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
});

export const treatmentPlan = pgTable("treatment_plan", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  oncologistId: uuid("oncologist_id").notNull().references(() => user.id),
  clinicalDirectorId: uuid("clinical_director_id").notNull().references(() => user.id),
  status: treatmentStatusEnum("status").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
});

export const labRequest = pgTable("lab_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  requestedBy: uuid("requested_by").notNull().references(() => user.id),
  status: labRequestStatusEnum("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
});

export const labResult = pgTable("lab_result", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  requestId: uuid("request_id").notNull().references(() => labRequest.id),
  uploadedBy: uuid("uploaded_by").notNull().references(() => user.id),
  reviewedBy: uuid("reviewed_by").references(() => user.id),
  status: labRequestStatusEnum("status").notNull().default("PENDING"),
  fileId: uuid("file_id").notNull().references(() => file.id),
  testDate: date("test_date").notNull(),
  fileHash: varchar("file_hash", { length: 128 }).notNull(),
  possibleDuplicate: boolean("possible_duplicate").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  fileHashPatientTestDateIdx: index("lab_result_file_hash_patient_test_date_idx").on(t.fileHash, t.patientId, t.testDate),
}));

export const clinicalDecision = pgTable("clinical_decision", {
  id: uuid("id").primaryKey().defaultRandom(),
  labResultId: uuid("lab_result_id").notNull().references(() => labResult.id),
  qaRecommendation: clinicalDecisionEnum("qa_recommendation"),
  qaReason: text("qa_reason"),
  qaDecidedBy: uuid("qa_decided_by").references(() => user.id),
  qaDecidedAt: timestamp("qa_decided_at"),
  finalDecision: clinicalDecisionEnum("final_decision"),
  finalReason: text("final_reason"),
  directorId: uuid("director_id").references(() => user.id),
  directorDecidedAt: timestamp("director_decided_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  labResultIdUnique: uniqueIndex("clinical_decision_lab_result_id_unique").on(t.labResultId),
}));

export const medicalRecord = pgTable("medical_record", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  createdBy: uuid("created_by").notNull().references(() => user.id),
  recordType: varchar("record_type", { length: 100 }).notNull(),
  summary: text("summary").notNull(),
  // Set only for the Post-call Summary note, so "has this meeting's summary been finalized" is a direct lookup rather than a timestamp guess.
  sourceMeetingId: uuid("source_meeting_id").references(() => meeting.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
});

export const clinicalNote = pgTable("clinical_note", {
  id: uuid("id").primaryKey().defaultRandom(),
  medicalRecordId: uuid("medical_record_id").notNull().references(() => medicalRecord.id),
  authorId: uuid("author_id").notNull().references(() => user.id),
  note: text("note").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
});

export const triageChecklist = pgTable("triage_checklist", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversation.id),
  completedBy: uuid("completed_by").notNull().references(() => user.id),
  completedAt: timestamp("completed_at").notNull(),
  presentingComplaint: text("presenting_complaint").notNull(),
  duration: varchar("duration", { length: 100 }).notNull(),
  functionalImpact: text("functional_impact").notNull(),
  priorMeasures: text("prior_measures").notNull(),
  canTalkWalkEat: text("can_talk_walk_eat").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  conversationIdUnique: uniqueIndex("triage_checklist_conversation_id_unique").on(t.conversationId),
}));

export const prescription = pgTable("prescription", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  doctorId: uuid("doctor_id").notNull().references(() => user.id),
  appointmentId: uuid("appointment_id").references(() => appointment.id),
  triageChecklistId: uuid("triage_checklist_id").references(() => triageChecklist.id),
  status: prescriptionStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
});

export const appointmentCard = pgTable("appointment_card", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentId: uuid("appointment_id").notNull().references(() => appointment.id),
  physicalCaseId: uuid("physical_case_id").notNull().references(() => physicalCase.id),
  filledBy: uuid("filled_by").notNull().references(() => user.id),
  filledAt: timestamp("filled_at"),
  vitalsSummary: text("vitals_summary").notNull(),
  notes: text("notes").notNull(),
  status: appointmentCardStatusEnum("status").notNull().default("DRAFT"),
  reviewedBy: uuid("reviewed_by").references(() => user.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  appointmentIdUnique: uniqueIndex("appointment_card_appointment_id_unique").on(t.appointmentId),
}));

export const appointmentCardChecklistItem = pgTable("appointment_card_checklist_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentCardId: uuid("appointment_card_id").notNull().references(() => appointmentCard.id),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  isChecked: boolean("is_checked").notNull().default(false),
  checkedAt: timestamp("checked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  cardItemUnique: uniqueIndex("appointment_card_checklist_item_unique").on(t.appointmentCardId, t.itemName),
}));