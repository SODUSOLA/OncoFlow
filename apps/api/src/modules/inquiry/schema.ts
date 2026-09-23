import { pgTable, uuid, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { publicInquiryStatusEnum, publicInquiryMessageSenderTypeEnum } from "../../db/enums.js";
import { patient } from "../patient/schema.js";
import { user } from "../auth/schema.js";

// name, email and phone are self-reported by an unauthenticated visitor, just enough to follow up and match a patient.
export const publicInquiry = pgTable("public_inquiry", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Only the SHA-256 hash is stored; the raw token goes to the visitor once, like a password hash.
  accessTokenHash: varchar("access_token_hash", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 32 }),
  status: publicInquiryStatusEnum("status").notNull().default("OPEN"),
  // Set by staff once the visitor is identified as an existing patient; nullable because most aren't.
  linkedPatientId: uuid("linked_patient_id").references(() => patient.id),
  assignedTo: uuid("assigned_to").references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  statusUpdatedIdx: index("public_inquiry_status_updated_idx").on(t.status, t.updatedAt),
}));

export const publicInquiryMessage = pgTable("public_inquiry_message", {
  id: uuid("id").primaryKey().defaultRandom(),
  inquiryId: uuid("inquiry_id").notNull().references(() => publicInquiry.id),
  senderType: publicInquiryMessageSenderTypeEnum("sender_type").notNull(),
  // Set only when senderType is STAFF — a visitor has no user row to reference.
  senderUserId: uuid("sender_user_id").references(() => user.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  inquiryIdx: index("public_inquiry_message_inquiry_idx").on(t.inquiryId, t.createdAt),
}));
