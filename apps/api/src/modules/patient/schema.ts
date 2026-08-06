import {
  pgTable, uuid, varchar, text, date, boolean, bigint, timestamp, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { patientStatusEnum } from "../../db/enums.js";
import { user } from "../auth/schema.js";
import { facility } from "../facility/schema.js";

export const patient = pgTable("patient", {
  id: uuid("id").primaryKey().defaultRandom(),
  uniquePatientId: varchar("unique_patient_id", { length: 32 }).notNull(),
  userId: uuid("user_id").references(() => user.id),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  dob: date("dob").notNull(),
  gender: varchar("gender", { length: 32 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  // Patient-self-editable, non-clinical fields (per the Patient role spec). No FK on
  // profilePictureFileId — same loose-reference convention as patientTimeline.referenceId
  // below, to avoid a circular schema import with the documents module (file.patientId
  // already references patient.id the other way).
  secondaryEmail: varchar("secondary_email", { length: 255 }),
  profilePictureFileId: uuid("profile_picture_file_id"),
  status: patientStatusEnum("status").notNull().default("ACTIVE"),
  facilityId: uuid("facility_id").notNull().references(() => facility.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  uniquePatientIdActive: uniqueIndex("patient_unique_id_active").on(t.uniquePatientId).where(sql`${t.isDeleted} = false`),
  userIdUnique: uniqueIndex("patient_user_id_unique").on(t.userId),
  facilityIdx: index("patient_facility_idx").on(t.facilityId),
  statusIdx: index("patient_status_idx").on(t.status),
  dobIdx: index("patient_dob_idx").on(t.dob),
}));

export const patientAddress = pgTable("patient_address", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  country: varchar("country", { length: 100 }).notNull(),
  state: varchar("state", { length: 100 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  address: text("address").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
});

export const emergencyContact = pgTable("emergency_contact", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  name: varchar("name", { length: 255 }).notNull(),
  relationship: varchar("relationship", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
});

export const patientTimeline = pgTable("patient_timeline", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  referenceId: uuid("reference_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Captures what a self-registering patient submits in the wizard (name/DOB/phone/preferred
// facility) before any staff member has reviewed it — deliberately separate from `patient`,
// which is the authoritative, staff-issued clinical record. A row here means "awaiting Regional
// Admin approval"; once approved, POST /patients creates the real `patient` row and this row
// is deleted (see PatientService.registerPatient) — its absence for a given userId is what
// "already handled" means, no separate status column needed.
export const patientRegistrationRequest = pgTable("patient_registration_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => user.id),
  // Snapshotted at registration time, not read live from `user` — avoids patient/controller.ts
  // needing a cross-module read into auth/index.ts, which would create an import cycle with
  // auth/service.ts's own cross-module write into patient/index.ts (.dependency-cruiser.js's
  // no-circular rule). Email isn't editable today anyway, so "as submitted" and "current" can't
  // actually diverge.
  email: varchar("email", { length: 255 }).notNull(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  dob: date("dob").notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  preferredFacilityId: uuid("preferred_facility_id").references(() => facility.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  userIdUnique: uniqueIndex("patient_registration_request_user_id_unique").on(t.userId),
}));

export const wallet = pgTable("wallet", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  // No DB-level default: every insert site (PatientService, seed/patient.ts) sets this
  // explicitly. A literal `0n` default here breaks drizzle-kit's snapshot diffing —
  // JSON.stringify can't serialize a raw BigInt when building the migration snapshot.
  balanceKobo: bigint("balance_kobo", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  patientIdUnique: uniqueIndex("wallet_patient_id_unique").on(t.patientId),
}));