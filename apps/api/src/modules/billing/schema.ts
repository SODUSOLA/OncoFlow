import {
  pgTable, uuid, varchar, integer, bigint, boolean, date, timestamp, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  serviceClassificationNameEnum, invoiceStatusEnum, invoiceComponentEnum, payoutRoleEnum,
  billingCycleEnum, paymentStatusEnum, subscriptionStatusEnum, walletTransactionTypeEnum,
  payeeOwnerTypeEnum, payoutStatusEnum, payoutSourceTypeEnum,
} from "../../db/enums.js";
import { patient, wallet } from "../patient/schema.js";
import { appointment } from "../appointment/schema.js";
import { facility } from "../facility/schema.js";
import { user } from "../auth/schema.js";

export const serviceClassification = pgTable("service_classification", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: serviceClassificationNameEnum("name").notNull().unique(),
  cappedNetworkFeeKobo: bigint("capped_network_fee_kobo", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Named variants under a classification (e.g. Chemotherapy > Chemo-radiation). Descriptive only: price still comes from the facility tariff for the classification.
export const serviceSubOption = pgTable("service_sub_option", {
  id: uuid("id").primaryKey().defaultRandom(),
  classificationId: uuid("classification_id").notNull().references(() => serviceClassification.id),
  code: varchar("code", { length: 64 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  classificationCodeUnique: uniqueIndex("service_sub_option_classification_code_unique").on(t.classificationId, t.code),
}));

export const tariff = pgTable("tariff", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull().references(() => facility.id),
  classificationId: uuid("classification_id").notNull().references(() => serviceClassification.id),
  networkFeeKobo: bigint("network_fee_kobo", { mode: "bigint" }).notNull(),
  facilityBedFeeKobo: bigint("facility_bed_fee_kobo", { mode: "bigint" }).notNull(),
  // Defaulted via sql`0` because drizzle-kit can't serialize a BigInt default, and so adding the column doesn't break already-seeded tariffs.
  professionalFeeKobo: bigint("professional_fee_kobo", { mode: "bigint" }).notNull().default(sql`0`),
  drugPriceKobo: bigint("drug_price_kobo", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  facilityClassificationUnique: uniqueIndex("tariff_facility_classification_unique").on(t.facilityId, t.classificationId),
}));

export const invoice = pgTable("invoice", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  appointmentId: uuid("appointment_id").references(() => appointment.id),
  facilityId: uuid("facility_id").notNull().references(() => facility.id),
  classificationId: uuid("classification_id").notNull().references(() => serviceClassification.id),
  subOptionId: uuid("sub_option_id").references(() => serviceSubOption.id),
  status: invoiceStatusEnum("status").notNull().default("DRAFT"),
  totalKobo: bigint("total_kobo", { mode: "bigint" }).notNull(),
  issuedAt: timestamp("issued_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  patientIdx: index("invoice_patient_idx").on(t.patientId),
  statusIdx: index("invoice_status_idx").on(t.status),
  issuedAtIdx: index("invoice_issued_at_idx").on(t.issuedAt),
}));

export const invoiceItem = pgTable("invoice_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoice.id),
  component: invoiceComponentEnum("component").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const professionalFeeSplit = pgTable("professional_fee_split", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoice.id),
  role: payoutRoleEnum("role").notNull(),
  recipientId: uuid("recipient_id").notNull().references(() => user.id),
  amountKobo: bigint("amount_kobo", { mode: "bigint" }).notNull(),
  isOutOfState: boolean("is_out_of_state").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const subscription = pgTable("subscription", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  billingCycle: billingCycleEnum("billing_cycle").notNull(),
  status: subscriptionStatusEnum("status").notNull().default("ACTIVE"),
  nextBillingDate: date("next_billing_date").notNull(),
  startedAt: timestamp("started_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
});

export const payment = pgTable("payment", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoice.id),
  walletId: uuid("wallet_id").notNull().references(() => wallet.id),
  gateway: varchar("gateway", { length: 50 }).notNull(),
  reference: varchar("reference", { length: 255 }).notNull().unique(),
  status: paymentStatusEnum("status").notNull().default("PENDING"),
  amountKobo: bigint("amount_kobo", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const walletTransaction = pgTable("wallet_transaction", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletId: uuid("wallet_id").notNull().references(() => wallet.id),
  paymentId: uuid("payment_id").references(() => payment.id),
  type: walletTransactionTypeEnum("type").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const payeeBankAccount = pgTable("payee_bank_account", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerType: payeeOwnerTypeEnum("owner_type").notNull(),
  ownerId: uuid("owner_id").notNull(),
  bankCode: varchar("bank_code", { length: 20 }).notNull(),
  accountNumber: varchar("account_number", { length: 20 }).notNull(),
  accountName: varchar("account_name", { length: 255 }).notNull(),
  verifiedAt: timestamp("verified_at"),
  verificationReference: varchar("verification_reference", { length: 255 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  ownerIdx: index("payee_bank_account_owner_idx").on(t.ownerType, t.ownerId),
}));

export const payout = pgTable("payout", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchReference: varchar("batch_reference", { length: 255 }).notNull(),
  payeeType: payeeOwnerTypeEnum("payee_type").notNull(),
  payeeId: uuid("payee_id").notNull(),
  payeeAccountId: uuid("payee_account_id").notNull().references(() => payeeBankAccount.id),
  totalAmountKobo: bigint("total_amount_kobo", { mode: "bigint" }).notNull(),
  status: payoutStatusEnum("status").notNull().default("PENDING"),
  monnifyTransferReference: varchar("monnify_transfer_reference", { length: 255 }),
  initiatedAt: timestamp("initiated_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  payeeIdx: index("payout_payee_idx").on(t.payeeType, t.payeeId),
  statusIdx: index("payout_status_idx").on(t.status),
  batchReferenceIdx: index("payout_batch_reference_idx").on(t.batchReference),
}));

export const payoutLineItem = pgTable("payout_line_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  payoutId: uuid("payout_id").notNull().references(() => payout.id),
  sourceType: payoutSourceTypeEnum("source_type").notNull(),
  sourceId: uuid("source_id").notNull().unique(),
  amountKobo: bigint("amount_kobo", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  payoutIdx: index("payout_line_item_payout_idx").on(t.payoutId),
}));