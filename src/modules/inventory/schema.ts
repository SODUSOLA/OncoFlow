import {
  pgTable, uuid, varchar, integer, date, boolean, timestamp,
} from "drizzle-orm/pg-core";
import { inventoryMovementTypeEnum, incidentTypeEnum, reconciliationStatusEnum } from "../../db/enums";
import { facility } from "../facility/schema";
import { user } from "../auth/schema";
import { file } from "../documents/schema";

export const drug = pgTable("drug", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  strength: varchar("strength", { length: 100 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
});

export const inventory = pgTable("inventory", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").references(() => facility.id),
  drugId: uuid("drug_id").notNull().references(() => drug.id),
  quantity: integer("quantity").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const inventoryMovement = pgTable("inventory_movement", {
  id: uuid("id").primaryKey().defaultRandom(),
  inventoryId: uuid("inventory_id").notNull().references(() => inventory.id),
  movementType: inventoryMovementTypeEnum("movement_type").notNull(),
  quantity: integer("quantity").notNull(),
  performedBy: uuid("performed_by").notNull().references(() => user.id),
  referenceId: uuid("reference_id"),
  evidenceFileId: uuid("evidence_file_id").references(() => file.id),
  incidentType: incidentTypeEnum("incident_type"),
  dispatchReference: varchar("dispatch_reference", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reconciliationRecord = pgTable("reconciliation_record", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull().references(() => facility.id),
  weekEnding: date("week_ending").notNull(),
  expectedQty: integer("expected_qty").notNull(),
  actualQty: integer("actual_qty").notNull(),
  variance: integer("variance").notNull(),
  resolvedBy: uuid("resolved_by").references(() => user.id),
  resolvedAt: timestamp("resolved_at"),
  status: reconciliationStatusEnum("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});