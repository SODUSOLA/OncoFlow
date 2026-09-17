import { pgTable, uuid, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { nursingCaseStatusEnum, nursingCaseReviewDecisionEnum } from "../../db/enums.js";
import { patient } from "../patient/schema.js";
import { user } from "../auth/schema.js";
import { regimenCycle } from "../clinical-metrics/schema.js";
import { file } from "../documents/schema.js";

// ONCOFLOW_NURSING_OFFICER_BUILD_GUIDE.md — the real unit of work. Tied to one physical
// visitation (a regimen_cycle), not a standalone document: the wizard's documentation sheet and
// (later, Finding 2) a structured data-entry form are both content *within* a case, and QA
// reviews the case as a whole rather than document-by-document.
export const nursingCase = pgTable("nursing_case", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  regimenCycleId: uuid("regimen_cycle_id").notNull().references(() => regimenCycle.id),
  startedBy: uuid("started_by").notNull().references(() => user.id),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  status: nursingCaseStatusEnum("status").notNull().default("STARTED"),
  closedBy: uuid("closed_by").references(() => user.id),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const nursingCaseReview = pgTable("nursing_case_review", {
  id: uuid("id").primaryKey().defaultRandom(),
  nursingCaseId: uuid("nursing_case_id").notNull().references(() => nursingCase.id),
  reviewedBy: uuid("reviewed_by").notNull().references(() => user.id),
  reviewedAt: timestamp("reviewed_at").notNull().defaultNow(),
  decision: nursingCaseReviewDecisionEnum("decision").notNull(),
  // Required (checked in the service, not the DB) when decision is REQUIREMENTS_INCOMPLETE —
  // a QA rejection with no stated reason gives the Nursing Officer nothing to act on.
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// References nursing_case_id, not the patient directly — this is content *within* a case
// (per the build guide's explicit correction), not a standalone entity.
export const nursingDocumentationSheet = pgTable("nursing_documentation_sheet", {
  id: uuid("id").primaryKey().defaultRandom(),
  nursingCaseId: uuid("nursing_case_id").notNull().references(() => nursingCase.id),
  authoredBy: uuid("authored_by").notNull().references(() => user.id),
  upiCodeEntered: text("upi_code_entered").notNull(),
  idPhotoFileId: uuid("id_photo_file_id").notNull().references(() => file.id),
  identityVerifiedAt: timestamp("identity_verified_at").notNull(),
  fileReference: uuid("file_reference").notNull().references(() => file.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// Finding 3 — a rejected upload (the file table's own virus-scan pipeline flagged it INFECTED)
// feeds Regional Admin's existing alert aggregator as a new source, not a new notification
// system. nursingCaseId is nullable: the rejection can happen before Step 2 in principle, or if
// the case context is otherwise unresolved at upload time.
export const uploadSecurityIncident = pgTable("upload_security_incident", {
  id: uuid("id").primaryKey().defaultRandom(),
  nursingCaseId: uuid("nursing_case_id").references(() => nursingCase.id),
  attemptedBy: uuid("attempted_by").notNull().references(() => user.id),
  fileScanResult: text("file_scan_result").notNull(),
  incidentReference: varchar("incident_reference", { length: 32 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
