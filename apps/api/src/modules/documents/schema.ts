import {
  pgTable, uuid, varchar, integer, boolean, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";
import { virusScanStatusEnum } from "../../db/enums.js";
import { patient } from "../patient/schema.js";
import { user } from "../auth/schema.js";

export const file = pgTable("file", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").references(() => patient.id),
  uploadedBy: uuid("uploaded_by").notNull().references(() => user.id),
  storageKey: varchar("storage_key", { length: 512 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  virusScanStatus: virusScanStatusEnum("virus_scan_status").notNull().default("PENDING"),
  fileHash: varchar("file_hash", { length: 128 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
});

export const fileVerificationStep = pgTable("file_verification_step", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileId: uuid("file_id").notNull().references(() => file.id),
  stepNumber: integer("step_number").notNull(),
  stepName: varchar("step_name", { length: 255 }).notNull(),
  verifiedBy: uuid("verified_by").references(() => user.id),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  fileStepUnique: uniqueIndex("file_verification_step_unique").on(t.fileId, t.stepNumber),
}));