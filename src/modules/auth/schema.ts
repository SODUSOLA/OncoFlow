import {
  pgTable, uuid, varchar, text, boolean, timestamp, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  userStatusEnum, roleNameEnum, accountLockTypeEnum, misconductStatusEnum,
} from "../../db/enums";
import { conversation } from "../messaging/schema";

export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  status: userStatusEnum("status").notNull().default("ACTIVE"),
  lastLogin: timestamp("last_login"),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  emailUniqueActive: uniqueIndex("user_email_unique_active").on(t.email).where(sql`${t.isDeleted} = false`),
  statusIdx: index("user_status_idx").on(t.status),
  lastLoginIdx: index("user_last_login_idx").on(t.lastLogin),
}));

export const role = pgTable("role", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: roleNameEnum("name").notNull().unique(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const permission = pgTable("permission", {
  id: uuid("id").primaryKey().defaultRandom(),
  resource: varchar("resource", { length: 255 }).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userRole = pgTable("user_role", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => user.id),
  roleId: uuid("role_id").notNull().references(() => role.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  userRoleUnique: uniqueIndex("user_role_unique").on(t.userId, t.roleId),
}));

export const rolePermission = pgTable("role_permission", {
  id: uuid("id").primaryKey().defaultRandom(),
  roleId: uuid("role_id").notNull().references(() => role.id),
  permissionId: uuid("permission_id").notNull().references(() => permission.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => user.id),
  device: varchar("device", { length: 255 }).notNull(),
  ip: varchar("ip", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  mfaVerified: boolean("mfa_verified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  userIdx: index("session_user_idx").on(t.userId),
  expiresAtIdx: index("session_expires_at_idx").on(t.expiresAt),
}));

export const accountLock = pgTable("account_lock", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => user.id),
  lockedBy: uuid("locked_by").notNull().references(() => user.id),
  lockedAt: timestamp("locked_at").notNull(),
  lockedUntil: timestamp("locked_until"),
  reason: text("reason").notNull(),
  lockType: accountLockTypeEnum("lock_type").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
});

export const misconductFlag = pgTable("misconduct_flag", {
  id: uuid("id").primaryKey().defaultRandom(),
  flaggedUserId: uuid("flagged_user_id").notNull().references(() => user.id),
  triggerReason: text("trigger_reason").notNull(),
  conversationId: uuid("conversation_id").references(() => conversation.id),
  status: misconductStatusEnum("status").notNull().default("OPEN"),
  reviewer1Id: uuid("reviewer_1_id").references(() => user.id),
  reviewer2Id: uuid("reviewer_2_id").references(() => user.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
});