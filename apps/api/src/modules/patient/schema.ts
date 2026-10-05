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
  // Patient-self-editable non-clinical fields; profilePictureFileId has no FK to avoid a circular schema import with documents.
  secondaryEmail: varchar("secondary_email", { length: 255 }),
  profilePictureFileId: uuid("profile_picture_file_id"),
  status: patientStatusEnum("status").notNull().default("ACTIVE"),
  facilityId: uuid("facility_id").notNull().references(() => facility.id),
  // Null until a Regional Admin confirms or reassigns the facility; it drives the admin queue and email, not app access.
  facilityConfirmedAt: timestamp("facility_confirmed_at"),
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

// The self-reported submission, kept separate from the authoritative patient row; it now means "pending facility confirmation" and is deleted once handled.
export const patientRegistrationRequest = pgTable("patient_registration_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => user.id),
  // Snapshotted email so patient/controller.ts needn't read auth, which would create an import cycle.
  email: varchar("email", { length: 255 }).notNull(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  dob: date("dob").notNull(),
  gender: varchar("gender", { length: 32 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  preferredFacilityId: uuid("preferred_facility_id").references(() => facility.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  userIdUnique: uniqueIndex("patient_registration_request_user_id_unique").on(t.userId),
}));

export const wallet = pgTable("wallet", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  // No DB default because a literal 0n breaks drizzle-kit snapshot diffing; every insert sets it explicitly.
  balanceKobo: bigint("balance_kobo", { mode: "bigint" }).notNull(),
  // Patient opt-in: invoices issued while this is on are paid from the wallet automatically when the balance covers them.
  autoDeductEnabled: boolean("auto_deduct_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  patientIdUnique: uniqueIndex("wallet_patient_id_unique").on(t.patientId),
}));