import crypto from "node:crypto";
import { db } from "../db";
import { and, eq } from "drizzle-orm";
import { role, user, userRole } from "../db/schema";

const roleName = "SUPER_ADMIN";
const testEmail = `test-super-admin-${process.pid}@example.com`;

const existingRoleRows = await db.select().from(role).where(eq(role.name, roleName));
let superAdminRoleId: string;

if (existingRoleRows.length > 0) {
  superAdminRoleId = existingRoleRows[0]!.id;
} else {
  superAdminRoleId = crypto.randomUUID();
  await db.insert(role).values({
    id: superAdminRoleId,
    name: roleName,
    description: "Test super admin",
  });
}

const existingUserRows = await db.select().from(user).where(eq(user.email, testEmail));
let testUserId: string;

if (existingUserRows.length > 0) {
  testUserId = existingUserRows[0]!.id;
} else {
  testUserId = crypto.randomUUID();
  await db.insert(user).values({
    id: testUserId,
    email: testEmail,
    passwordHash: "test",
    status: "ACTIVE",
    mfaEnabled: false,
  });
}

const existingAssignmentRows = await db.select().from(userRole).where(
  and(eq(userRole.userId, testUserId), eq(userRole.roleId, superAdminRoleId)),
);
if (existingAssignmentRows.length === 0) {
  await db.insert(userRole).values({
    id: crypto.randomUUID(),
    userId: testUserId,
    roleId: superAdminRoleId,
  });
}

process.env.TEST_USER_ID = testUserId;
