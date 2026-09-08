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

// ============================================================================
// ONCOFLOW_PATIENT_DATA_MODELS.md §1 — Regimen / Cycle
// ============================================================================

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

// completed_cycles / current cycle are derived from these rows at query time, never stored —
// see RegimenRepository.
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

// ============================================================================
// ONCOFLOW_PATIENT_DATA_MODELS.md §2 — Vitals (time-series)
// ============================================================================

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

// Severity (e.g. the orange "elevated" blood-pressure treatment) is computed at query time
// against this table, never hand-set per reading — same rule as lab_analyte_reference below.
export const vitalReferenceRange = pgTable("vital_reference_range", {
  vitalType: vitalTypeEnum("vital_type").primaryKey(),
  low: numeric("low").notNull(),
  high: numeric("high").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================================
// ONCOFLOW_LAB_AND_METRICS_WORKFLOW.md Track 1 — Clinical Metrics Snapshot
// ============================================================================

// A deliberate exception to "never store computed values" (per the doc): bmi/bsa/crcl are
// fixed to the cycle they were recorded for, so they must not silently change if the formulas
// or reference bands are revised later.
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
  // Computed results (snapshot, per the exception above). Creatinine is deliberately NOT a
  // column here — CrCl reads it from nursing_lab_value under this snapshot's nursing_lab_entry,
  // so there is exactly one place creatinine is ever recorded, not two that could disagree.
  bmi: numeric("bmi").notNull(),
  bmiClassification: bmiClassificationEnum("bmi_classification").notNull(),
  bsa: numeric("bsa").notNull(),
  crcl: numeric("crcl").notNull(),
  crclTier: crclTierEnum("crcl_tier").notNull(),
  // eGFR (CKD-EPI 2021) — a separate calculation from CrCl above, never one standing in for the
  // other. Computed alongside CrCl from the same inputs, no additional Nursing Officer entry.
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
  // References lab_analyte_reference.analyteCode below (declared after this table, so the FK
  // constraint is added via a separate ALTER rather than an inline .references() to avoid a
  // forward-reference; the repository still always writes/reads against real analyte codes).
  analyteCode: text("analyte_code").notNull(),
  value: numeric("value").notNull(),
  unit: text("unit").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  entryIdIdx: index("nursing_lab_value_entry_id_idx").on(t.nursingLabEntryId),
}));

// Seeded, not user-editable — clinical constants, centralized so every surface (Nursing
// Officer's entry form, the Video Room's Safety Check Banner, Patient File) computes identical
// severity from the same bands.
export const labAnalyteReference = pgTable("lab_analyte_reference", {
  analyteCode: text("analyte_code").primaryKey(),
  displayName: text("display_name").notNull(),
  unit: text("unit").notNull(),
  normalLow: numeric("normal_low").notNull(),
  normalHigh: numeric("normal_high").notNull(),
  // Not given in the source reference doc for the FBC/E-U-Cr panel — only "Normal (x-y)" ranges
  // were provided, so these stay nullable until a clinical lead supplies real critical cutoffs.
  criticalLow: numeric("critical_low"),
  criticalHigh: numeric("critical_high"),
});

// ============================================================================
// ONCOFLOW_LAB_AND_METRICS_WORKFLOW.md Track 2 — Lab Document Approval Chain
// ============================================================================

export const labDocument = pgTable("lab_document", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  uploadedBy: uuid("uploaded_by").notNull().references(() => user.id),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  // Reuses the existing file/virus-scan infrastructure (documents module) rather than a raw
  // storage-pointer column — this system already has a real signed-upload/download pipeline.
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
  // Required (at the service layer, not a DB constraint) when decision is REJECTED or
  // HOLD_FROM_CHEMO.
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  labDocumentIdIdx: index("lab_document_review_lab_document_id_idx").on(t.labDocumentId),
}));

// ============================================================================
// Shared case-lock mechanism
// ============================================================================

export const caseLock = pgTable("case_lock", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  triggeredBy: caseLockTriggerEnum("triggered_by").notNull(),
  // Polymorphic — points at clinical_metrics_snapshot.id (CRCL_CRITICAL) or
  // lab_document_review.id (QA_HOLD) depending on triggeredBy. No FK constraint is possible
  // across two different target tables, so this is a plain uuid column; the repository always
  // resolves it via triggeredBy, never blindly joins it.
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
  // A patient should have at most one currently-active lock — enforced at the service layer
  // (checked before insert), not a partial unique index, since this Postgres/Drizzle setup's
  // other unique indexes are all unconditional and a WHERE-based partial unique would be the
  // first of its kind in this schema.
}));
