import {
  pgTable, uuid, varchar, text, date, boolean, bigint, timestamp, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { patientStatusEnum } from "../../db/enums";
import { user } from "../auth/schema";
import { facility } from "../facility/schema";

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

export const wallet = pgTable("wallet", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  balanceKobo: bigint("balance_kobo", { mode: "bigint" }).notNull().default(0n),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  patientIdUnique: uniqueIndex("wallet_patient_id_unique").on(t.patientId),
}));