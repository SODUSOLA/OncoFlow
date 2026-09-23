import { pgTable, uuid, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { nursingCaseStatusEnum, nursingCaseReviewDecisionEnum } from "../../db/enums.js";
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
  // Required (in the service) for REQUIREMENTS_INCOMPLETE, since a rejection without a reason gives the nurse nothing to act on.
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Belongs to a case rather than a patient, since it is content within the case.
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

// A rejected (INFECTED) upload feeds Regional Admin's alert aggregator; nursingCaseId is nullable since the case may be unresolved at upload time.
export const uploadSecurityIncident = pgTable("upload_security_incident", {
  id: uuid("id").primaryKey().defaultRandom(),
  nursingCaseId: uuid("nursing_case_id").references(() => nursingCase.id),
  attemptedBy: uuid("attempted_by").notNull().references(() => user.id),
  fileScanResult: text("file_scan_result").notNull(),
  incidentReference: varchar("incident_reference", { length: 32 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
