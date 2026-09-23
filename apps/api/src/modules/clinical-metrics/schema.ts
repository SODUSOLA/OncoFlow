import {
  pgTable, uuid, varchar, text, numeric, integer, boolean, timestamp, date, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  regimenStatusEnum, regimenCycleStatusEnum, vitalTypeEnum, vitalSourceEnum,
  biologicalSexEnum, bmiClassificationEnum, crclTierEnum, egfrStageEnum,
  labDocumentWorkflowStatusEnum, labDocumentReviewStageEnum, labDocumentReviewDecisionEnum,
  caseLockTriggerEnum, caseLockStatusEnum, caseLockResolvedByRoleEnum, caseLockResolutionEnum,
} from "../../db/enums.js";
import { patient } from "../patient/schema.js";
import { user } from "../auth/schema.js";
import { meeting } from "../messaging/schema.js";
import { file } from "../documents/schema.js";

// Regimen and cycle tables (PATIENT_DATA_MODELS §1).

export const regimen = pgTable("regimen", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  drugName: varchar("drug_name", { length: 255 }).notNull(),
  protocolCode: varchar("protocol_code", { length: 100 }).notNull(),
  totalCycles: integer("total_cycles").notNull(),
  cycleIntervalDays: integer("cycle_interval_days").notNull(),
  status: regimenStatusEnum("status").notNull().default("ACTIVE"),
  startedAt: timestamp("started_at").notNull(),
  discontinuedReason: text("discontinued_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  patientIdIdx: index("regimen_patient_id_idx").on(t.patientId),
}));

// Completed and current cycle counts are derived from these rows at query time, never stored.
export const regimenCycle = pgTable("regimen_cycle", {
  id: uuid("id").primaryKey().defaultRandom(),
  regimenId: uuid("regimen_id").notNull().references(() => regimen.id),
  cycleNumber: integer("cycle_number").notNull(),
  scheduledDate: date("scheduled_date").notNull(),
  administeredDate: date("administered_date"),
  status: regimenCycleStatusEnum("status").notNull().default("SCHEDULED"),
  notes: text("notes"),
  administeredBy: uuid("administered_by").references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  regimenIdIdx: index("regimen_cycle_regimen_id_idx").on(t.regimenId),
  regimenCycleNumberUnique: uniqueIndex("regimen_cycle_regimen_id_cycle_number_unique").on(t.regimenId, t.cycleNumber),
}));

// Vitals time-series tables (PATIENT_DATA_MODELS §2).

export const vitalReading = pgTable("vital_reading", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  vitalType: vitalTypeEnum("vital_type").notNull(),
  value: numeric("value").notNull(),
  recordedAt: timestamp("recorded_at").notNull(),
  source: vitalSourceEnum("source").notNull(),
  recordedBy: uuid("recorded_by").references(() => user.id),
  meetingId: uuid("meeting_id").references(() => meeting.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  patientTypeRecordedIdx: index("vital_reading_patient_id_vital_type_recorded_at_idx").on(t.patientId, t.vitalType, t.recordedAt),
}));

// Severity is computed at query time against this table, never set per reading.
export const vitalReferenceRange = pgTable("vital_reference_range", {
  vitalType: vitalTypeEnum("vital_type").primaryKey(),
  low: numeric("low").notNull(),
  high: numeric("high").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Clinical metrics snapshot tables (LAB_AND_METRICS Track 1).

// A deliberate exception to "never store computed values": bmi/bsa/crcl are frozen per cycle so later formula changes don't rewrite history.
export const clinicalMetricsSnapshot = pgTable("clinical_metrics_snapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  regimenCycleId: uuid("regimen_cycle_id").references(() => regimenCycle.id),
  recordedBy: uuid("recorded_by").notNull().references(() => user.id),
  recordedAt: timestamp("recorded_at").notNull(),
  // Raw inputs.
  weightKg: numeric("weight_kg").notNull(),
  heightCm: numeric("height_cm").notNull(),
  ageYears: integer("age_years").notNull(),
  sex: biologicalSexEnum("sex").notNull(),
  // Computed results; creatinine lives in nursing_lab_value so it is only recorded in one place.
  bmi: numeric("bmi").notNull(),
  bmiClassification: bmiClassificationEnum("bmi_classification").notNull(),
  bsa: numeric("bsa").notNull(),
  crcl: numeric("crcl").notNull(),
  crclTier: crclTierEnum("crcl_tier").notNull(),
  // eGFR (CKD-EPI 2021), a separate calculation from CrCl computed from the same inputs.
  egfr: numeric("egfr").notNull(),
  egfrStage: egfrStageEnum("egfr_stage").notNull(),
  supersededAt: timestamp("superseded_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  patientIdIdx: index("clinical_metrics_snapshot_patient_id_idx").on(t.patientId),
}));

// 1:1 with clinical_metrics_snapshot — same cycle submission, entered together.
export const nursingLabEntry = pgTable("nursing_lab_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicalMetricsSnapshotId: uuid("clinical_metrics_snapshot_id").notNull().references(() => clinicalMetricsSnapshot.id),
  enteredBy: uuid("entered_by").notNull().references(() => user.id),
  enteredAt: timestamp("entered_at").notNull(),
  // Set if transcribed from a patient-uploaded document, null for an in-house draw.
  sourceLabDocumentId: uuid("source_lab_document_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  snapshotIdUnique: uniqueIndex("nursing_lab_entry_snapshot_id_unique").on(t.clinicalMetricsSnapshotId),
}));

export const nursingLabValue = pgTable("nursing_lab_value", {
  id: uuid("id").primaryKey().defaultRandom(),
  nursingLabEntryId: uuid("nursing_lab_entry_id").notNull().references(() => nursingLabEntry.id),
  // References lab_analyte_reference; the FK is added by a separate ALTER because that table is declared later.
  analyteCode: text("analyte_code").notNull(),
  value: numeric("value").notNull(),
  unit: text("unit").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  entryIdIdx: index("nursing_lab_value_entry_id_idx").on(t.nursingLabEntryId),
}));

// Seeded clinical constants, centralized so every surface computes identical severity.
export const labAnalyteReference = pgTable("lab_analyte_reference", {
  analyteCode: text("analyte_code").primaryKey(),
  displayName: text("display_name").notNull(),
  unit: text("unit").notNull(),
  normalLow: numeric("normal_low").notNull(),
  normalHigh: numeric("normal_high").notNull(),
  // Nullable until a clinical lead supplies critical cutoffs; the source only gave normal ranges.
  criticalLow: numeric("critical_low"),
  criticalHigh: numeric("critical_high"),
});

// Lab document approval chain tables (LAB_AND_METRICS Track 2).

export const labDocument = pgTable("lab_document", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  uploadedBy: uuid("uploaded_by").notNull().references(() => user.id),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  // Reuses the existing file and virus-scan pipeline rather than a raw storage pointer.
  fileId: uuid("file_id").notNull().references(() => file.id),
  // Date printed on the report itself — what Admin cross-references at the first review stage.
  claimedCollectionDate: date("claimed_collection_date").notNull(),
  workflowStatus: labDocumentWorkflowStatusEnum("workflow_status").notNull().default("PENDING_ADMIN_REVIEW"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  patientIdIdx: index("lab_document_patient_id_idx").on(t.patientId),
}));

export const labDocumentReview = pgTable("lab_document_review", {
  id: uuid("id").primaryKey().defaultRandom(),
  labDocumentId: uuid("lab_document_id").notNull().references(() => labDocument.id),
  stage: labDocumentReviewStageEnum("stage").notNull(),
  reviewedBy: uuid("reviewed_by").notNull().references(() => user.id),
  reviewedAt: timestamp("reviewed_at").notNull().defaultNow(),
  decision: labDocumentReviewDecisionEnum("decision").notNull(),
  // Required at the service layer when the decision is REJECTED or HOLD_FROM_CHEMO.
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  labDocumentIdIdx: index("lab_document_review_lab_document_id_idx").on(t.labDocumentId),
}));

// Shared case-lock table.

export const caseLock = pgTable("case_lock", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  triggeredBy: caseLockTriggerEnum("triggered_by").notNull(),
  // Polymorphic uuid (snapshot or review id by triggeredBy) with no FK, since it targets two tables.
  triggeredByReference: uuid("triggered_by_reference").notNull(),
  triggeredAt: timestamp("triggered_at").notNull().defaultNow(),
  status: caseLockStatusEnum("status").notNull().default("LOCKED"),
  resolvedBy: uuid("resolved_by").references(() => user.id),
  resolvedByRole: caseLockResolvedByRoleEnum("resolved_by_role"),
  resolution: caseLockResolutionEnum("resolution"),
  resolutionReason: text("resolution_reason"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  patientIdIdx: index("case_lock_patient_id_idx").on(t.patientId),
  // At most one active lock per patient, enforced in the service rather than by a partial unique index.
}));
