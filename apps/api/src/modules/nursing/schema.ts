import { pgTable, uuid, text, varchar, timestamp, date, time, index } from "drizzle-orm/pg-core";
import { nursingCaseStatusEnum, nursingCaseReviewDecisionEnum, nursingCaseEventTypeEnum } from "../../db/enums.js";
import { patient } from "../patient/schema.js";
import { user } from "../auth/schema.js";
import { regimenCycle } from "../clinical-metrics/schema.js";
import { file } from "../documents/schema.js";

// The unit of work: one physical visitation (a regimen_cycle), with the documentation sheet as content within the case that QA reviews as a whole.
export const nursingCase = pgTable("nursing_case", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  regimenCycleId: uuid("regimen_cycle_id").notNull().references(() => regimenCycle.id),
  startedBy: uuid("started_by").notNull().references(() => user.id),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  status: nursingCaseStatusEnum("status").notNull().default("STARTED"),
  closedBy: uuid("closed_by").references(() => user.id),
  closedAt: timestamp("closed_at"),
  // Set once the nurse confirms the patient in front of them matches the profile photo on file. Lives on
  // the case (not the sheet) so it survives leaving mid-documentation: resuming never repeats verification.
  identityVerifiedAt: timestamp("identity_verified_at"),
  // Stamped live by the nurse's Start/End Infusion buttons (not typed afterwards); the documentation sheet's
  // infusion times are derived from these at submission.
  infusionStartedAt: timestamp("infusion_started_at"),
  infusionEndedAt: timestamp("infusion_ended_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// [append-only] What happened during a case and when, so Regional Admin can watch a visitation as it unfolds.
export const nursingCaseEvent = pgTable("nursing_case_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  nursingCaseId: uuid("nursing_case_id").notNull().references(() => nursingCase.id),
  eventType: nursingCaseEventTypeEnum("event_type").notNull(),
  actorId: uuid("actor_id").notNull().references(() => user.id),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  caseIdx: index("nursing_case_event_case_idx").on(t.nursingCaseId, t.occurredAt),
}));

export const nursingCaseReview = pgTable("nursing_case_review", {
  id: uuid("id").primaryKey().defaultRandom(),
  nursingCaseId: uuid("nursing_case_id").notNull().references(() => nursingCase.id),
  reviewedBy: uuid("reviewed_by").notNull().references(() => user.id),
  reviewedAt: timestamp("reviewed_at").notNull().defaultNow(),
  decision: nursingCaseReviewDecisionEnum("decision").notNull(),
  // Required (in the service) for REQUIREMENTS_INCOMPLETE, since a rejection without a reason gives the nurse nothing to act on.
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Belongs to a case rather than a patient, since it is content within the case. One row per case: a
// resubmission after QA sends it back (REQUIREMENTS_INCOMPLETE) updates this row rather than adding another.
export const nursingDocumentationSheet = pgTable("nursing_documentation_sheet", {
  id: uuid("id").primaryKey().defaultRandom(),
  nursingCaseId: uuid("nursing_case_id").notNull().references(() => nursingCase.id),
  authoredBy: uuid("authored_by").notNull().references(() => user.id),
  // The patient's UPI as recorded at verification (server-filled from the patient record, no longer typed);
  // the ID-photo reference is nullable since verification now compares against the profile photo instead of
  // a fresh capture. Both kept so sheets submitted before this change still read back.
  upiCodeEntered: text("upi_code_entered").notNull(),
  idPhotoFileId: uuid("id_photo_file_id").references(() => file.id),
  identityVerifiedAt: timestamp("identity_verified_at").notNull(),
  // Legacy free-form upload from before the structured form replaced it; nullable since no current
  // submission produces one, kept so already-submitted sheets still read back correctly.
  fileReference: uuid("file_reference").references(() => file.id),
  // The structured content from NURSING DOCUMENTATION SHEET (admin's copy) — everything on it that
  // isn't already its own record elsewhere (vitals go to vital_reading, labs and biometrics to
  // clinical_metrics_snapshot/nursing_lab_value, medications to drug_usage).
  diagnosis: text("diagnosis"),
  managingConsultant: text("managing_consultant"),
  treatmentDate: date("treatment_date"),
  infusionStartTime: time("infusion_start_time"),
  infusionEndTime: time("infusion_end_time"),
  note: text("note"),
  nextAppointmentDate: date("next_appointment_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// A rejected (INFECTED) upload feeds Regional Admin's alert aggregator; nursingCaseId is nullable since the case may be unresolved at upload time.
export const uploadSecurityIncident = pgTable("upload_security_incident", {
  id: uuid("id").primaryKey().defaultRandom(),
  nursingCaseId: uuid("nursing_case_id").references(() => nursingCase.id),
  attemptedBy: uuid("attempted_by").notNull().references(() => user.id),
  fileScanResult: text("file_scan_result").notNull(),
  incidentReference: varchar("incident_reference", { length: 32 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// A nurse's report that the patient in front of them doesn't match the profile on file. Recorded and sent to
// Regional Admin rather than just walking away, so a possible wrong-patient event leaves a trail.
export const identityMismatchReport = pgTable("identity_mismatch_report", {
  id: uuid("id").primaryKey().defaultRandom(),
  nursingCaseId: uuid("nursing_case_id").notNull().references(() => nursingCase.id),
  reportedBy: uuid("reported_by").notNull().references(() => user.id),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
