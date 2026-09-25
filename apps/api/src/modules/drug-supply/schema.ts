import { pgTable, uuid, text, integer, date, boolean, timestamp, index } from "drizzle-orm/pg-core";
import {
  drugRequestStatusEnum, drugDispatchStatusEnum, drugLedgerReasonEnum, regionalDrugLedgerReasonEnum,
  drugLossReasonEnum, drugReconciliationScopeEnum,
} from "../../db/enums.js";
import { user } from "../auth/schema.js";
import { facility } from "../facility/schema.js";
import { drug } from "../inventory/schema.js";
import { nursingCase } from "../nursing/schema.js";
import { file } from "../documents/schema.js";

// A Nursing Officer's request for drugs, sent to Regional Admin; the existing drug table serves as the catalog.
export const drugRequest = pgTable("drug_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestedBy: uuid("requested_by").notNull().references(() => user.id),
  facilityId: uuid("facility_id").notNull().references(() => facility.id),
  status: drugRequestStatusEnum("status").notNull().default("REQUESTED"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  facilityStatusIdx: index("drug_request_facility_status_idx").on(t.facilityId, t.status),
}));

export const drugRequestLine = pgTable("drug_request_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  drugRequestId: uuid("drug_request_id").notNull().references(() => drugRequest.id),
  drugId: uuid("drug_id").notNull().references(() => drug.id),
  quantityRequested: integer("quantity_requested").notNull(),
});

// Regional Admin's fulfilment of a request; acknowledgment by the officer is what credits their stock.
export const drugDispatch = pgTable("drug_dispatch", {
  id: uuid("id").primaryKey().defaultRandom(),
  drugRequestId: uuid("drug_request_id").notNull().references(() => drugRequest.id),
  dispatchedBy: uuid("dispatched_by").notNull().references(() => user.id),
  dispatchedAt: timestamp("dispatched_at").notNull().defaultNow(),
  status: drugDispatchStatusEnum("status").notNull().default("IN_TRANSIT"),
  acknowledgedBy: uuid("acknowledged_by").references(() => user.id),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
});

// Separate from the requested quantity because regional stock can force a partial fulfilment.
export const drugDispatchLine = pgTable("drug_dispatch_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  drugDispatchId: uuid("drug_dispatch_id").notNull().references(() => drugDispatch.id),
  drugId: uuid("drug_id").notNull().references(() => drug.id),
  quantityDispatched: integer("quantity_dispatched").notNull(),
});

// Append-only per-officer stock ledger: current stock is SUM(quantity_delta), never a stored counter.
export const drugStockLedgerEntry = pgTable("drug_stock_ledger_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  nursingOfficerId: uuid("nursing_officer_id").notNull().references(() => user.id),
  drugId: uuid("drug_id").notNull().references(() => drug.id),
  quantityDelta: integer("quantity_delta").notNull(),
  reason: drugLedgerReasonEnum("reason").notNull(),
  // Polymorphic (dispatch, usage or loss report id, by reason), so it has no FK.
  referenceId: uuid("reference_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  officerDrugIdx: index("drug_stock_ledger_officer_drug_idx").on(t.nursingOfficerId, t.drugId),
}));

// Append-only ledger of the region's own stock, dispatched from and replenished by procurement.
export const regionalDrugStockLedgerEntry = pgTable("regional_drug_stock_ledger_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  drugId: uuid("drug_id").notNull().references(() => drug.id),
  quantityDelta: integer("quantity_delta").notNull(),
  reason: regionalDrugLedgerReasonEnum("reason").notNull(),
  referenceId: uuid("reference_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  drugIdx: index("regional_drug_ledger_drug_idx").on(t.drugId),
}));

// A drug administered against a nursing case; creating one debits the officer's ledger in the same transaction.
export const drugUsage = pgTable("drug_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  nursingCaseId: uuid("nursing_case_id").notNull().references(() => nursingCase.id),
  drugId: uuid("drug_id").notNull().references(() => drug.id),
  administeredBy: uuid("administered_by").notNull().references(() => user.id),
  quantityUsed: integer("quantity_used").notNull(),
  usedAt: timestamp("used_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
});

// A stock incident outside any case (breakage, spoilage, expiry, wastage); has no patient context but must alert Regional Admin and SDNS.
export const drugLossReport = pgTable("drug_loss_report", {
  id: uuid("id").primaryKey().defaultRandom(),
  nursingOfficerId: uuid("nursing_officer_id").notNull().references(() => user.id),
  drugId: uuid("drug_id").notNull().references(() => drug.id),
  quantityLost: integer("quantity_lost").notNull(),
  // The incident type (breakage, spoilage, expiry, wastage). Named "reason" for history; see drugLossReasonEnum.
  reason: drugLossReasonEnum("reason").notNull(),
  // The nurse's written reason — required for every new report; nullable only for older ones.
  notes: text("notes"),
  // Evidence photo; nullable only for reports filed before photos were required.
  photoFileId: uuid("photo_file_id").references(() => file.id),
  reportedAt: timestamp("reported_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
});

// A physical count against the ledger; expected is snapshotted so the record stays historically fixed.
export const drugStockReconciliation = pgTable("drug_stock_reconciliation", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope: drugReconciliationScopeEnum("scope").notNull(),
  // Set only when scope is NURSING_OFFICER.
  nursingOfficerId: uuid("nursing_officer_id").references(() => user.id),
  drugId: uuid("drug_id").notNull().references(() => drug.id),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  expectedQuantity: integer("expected_quantity").notNull(),
  countedQuantity: integer("counted_quantity").notNull(),
  variance: integer("variance").notNull(),
  countedBy: uuid("counted_by").notNull().references(() => user.id),
  countedAt: timestamp("counted_at").notNull().defaultNow(),
  // Added beyond the spec so a flagged variance can be closed instead of alerting forever.
  resolvedBy: uuid("resolved_by").references(() => user.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
