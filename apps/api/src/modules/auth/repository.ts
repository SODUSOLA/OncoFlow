import { db } from "../../db/index.js";
import { eq, sql, and } from "drizzle-orm";
import {
  user, role, permission, userRole, rolePermission, session,
  accountLock, misconductFlag, emailVerificationToken, passwordResetToken,
} from "./schema.js";

// Data access for users.
export class UserRepository {
  // Finds a user by id.
  async findById(id: string) {
    const row = await db.select().from(user).where(eq(user.id, id)).limit(1);
    return row[0] ?? null;
  }

  // Points a user at their profile image file.
  async setProfilePicture(id: string, fileId: string) {
    await db.update(user).set({ profilePictureFileId: fileId, updatedAt: new Date() }).where(eq(user.id, id));
  }

  // Finds a non-deleted user by email.
  async findByEmail(email: string) {
    const row = await db
      .select()
      .from(user)
      .where(sql`${user.email} = ${email} AND ${user.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  // Inserts a user.
  async create(data: typeof user.$inferInsert) {
    const row = await db.insert(user).values(data).returning();
    return row[0]!;
  }

  // Updates a user's fields.
  async update(id: string, data: Partial<typeof user.$inferInsert>) {
    const row = await db.update(user).set(data).where(eq(user.id, id)).returning();
    return row[0] ?? null;
  }

  // Soft-deletes a user.
  async softDelete(id: string) {
    await db
      .update(user)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(eq(user.id, id));
  }

  // Lists users holding any CONSULTING_* role for the consultant picker, optionally narrowed to one facility.
  async findConsultants(facilityId?: string) {
    return db.execute<{ id: string; email: string; facility_id: string | null; role_name: string }>(sql`
      SELECT DISTINCT u.id, u.email, u.facility_id, r.name::text AS role_name
      FROM "user" u
      JOIN user_role ur ON ur.user_id = u.id
      JOIN role r ON r.id = ur.role_id
      WHERE r.name::text LIKE 'CONSULTING_%'
        AND u.is_deleted = false
        ${facilityId ? sql`AND u.facility_id = ${facilityId}` : sql``}
      ORDER BY u.email
    `);
  }
}

// Non-patient accounts registered to the given facilities (null = all), with their roles, newest first.
export async function findStaffByFacilities(facilityIds: string[] | null) {
  if (facilityIds && facilityIds.length === 0) return [];
  return db.execute<{
    id: string; email: string; first_name: string | null; last_name: string | null; status: string;
    facility_id: string | null; facility_name: string | null; created_at: Date; role_name: string;
  }>(sql`
    SELECT u.id, u.email, u.first_name, u.last_name, u.status::text AS status, u.facility_id, f.name AS facility_name,
           u.created_at, r.name::text AS role_name
    FROM "user" u
    JOIN user_role ur ON ur.user_id = u.id
    JOIN role r ON r.id = ur.role_id
    LEFT JOIN facility f ON f.id = u.facility_id
    WHERE u.is_deleted = false AND r.name::text <> 'PATIENT'
      ${facilityIds ? sql`AND u.facility_id IN (${sql.join(facilityIds.map((id) => sql`${id}`), sql`, `)})` : sql``}
    ORDER BY u.created_at DESC
    LIMIT 200
  `);
}

// Data access for roles.
export class RoleRepository {
  // Finds a role by id.
  async findById(id: string) {
    const row = await db.select().from(role).where(eq(role.id, id)).limit(1);
    return row[0] ?? null;
  }

  // Finds a role by name.
  async findByName(name: string) {
    const row = await db
      .select()
      .from(role)
      .where(sql`${role.name}::text = ${name}`)
      .limit(1);
    return row[0] ?? null;
  }

  // Lists all roles.
  async findAll() {
    return db.select().from(role);
  }
}

// Data access for permissions.
export class PermissionRepository {
  // Finds a permission by resource and action.
  async findByResourceAction(resource: string, action: string) {
    const row = await db
      .select()
      .from(permission)
      .where(sql`${permission.resource} = ${resource} AND ${permission.action} = ${action}`)
      .limit(1);
    return row[0] ?? null;
  }

  // Inserts a permission.
  async create(data: typeof permission.$inferInsert) {
    const row = await db.insert(permission).values(data).returning();
    return row[0]!;
  }
}

// Data access for user-to-role assignments.
export class UserRoleRepository {
  // Lists a user's roles.
  async findByUser(userId: string) {
    return db
      .select({
        id: userRole.id,
        roleId: userRole.roleId,
        roleName: role.name,
        roleDescription: role.description,
      })
      .from(userRole)
      .innerJoin(role, eq(userRole.roleId, role.id))
      .where(sql`${userRole.userId} = ${userId}`);
  }

  // Assigns a role to a user.
  async assign(userId: string, roleId: string) {
    const row = await db.insert(userRole).values({ userId, roleId }).returning();
    return row[0]!;
  }

  // Removes a role from a user.
  async remove(userId: string, roleId: string) {
    await db
      .delete(userRole)
      .where(sql`${userRole.userId} = ${userId} AND ${userRole.roleId} = ${roleId}`);
  }
}

// Data access for role-to-permission grants.
export class RolePermissionRepository {
  // Grants a permission to a role.
  async assign(roleId: string, permissionId: string) {
    const row = await db.insert(rolePermission).values({ roleId, permissionId }).returning();
    return row[0]!;
  }

  // Removes a permission from a role.
  async remove(roleId: string, permissionId: string) {
    await db
      .delete(rolePermission)
      .where(sql`${rolePermission.roleId} = ${roleId} AND ${rolePermission.permissionId} = ${permissionId}`);
  }
}

// Data access for login sessions.
export class SessionRepository {
  // Finds a session by id.
  async findById(id: string) {
    const row = await db.select().from(session).where(eq(session.id, id)).limit(1);
    return row[0] ?? null;
  }

  // Lists a user's active (unrevoked, unexpired) sessions.
  async findActiveByUser(userId: string) {
    return db
      .select()
      .from(session)
      .where(sql`${session.userId} = ${userId} AND ${session.revokedAt} IS NULL AND ${session.expiresAt} > NOW()`)
      .orderBy(session.createdAt);
  }

  // Inserts a session.
  async create(data: typeof session.$inferInsert) {
    const row = await db.insert(session).values(data).returning();
    return row[0]!;
  }

  // Revokes one session.
  async revoke(id: string) {
    await db.update(session).set({ revokedAt: new Date() }).where(eq(session.id, id));
  }

  // Revokes every session a user has.
  async revokeAllForUser(userId: string) {
    await db
      .update(session)
      .set({ revokedAt: new Date() })
      .where(sql`${session.userId} = ${userId} AND ${session.revokedAt} IS NULL`);
  }
}

// Data access for email verification tokens.
export class EmailVerificationTokenRepository {
  // Inserts a verification token.
  async create(data: typeof emailVerificationToken.$inferInsert) {
    const row = await db.insert(emailVerificationToken).values(data).returning();
    return row[0]!;
  }

  // Finds an unconsumed, unexpired token by its hash.
  async findValidByHash(tokenHash: string) {
    const row = await db
      .select()
      .from(emailVerificationToken)
      .where(sql`${emailVerificationToken.tokenHash} = ${tokenHash}
        AND ${emailVerificationToken.consumedAt} IS NULL
        AND ${emailVerificationToken.expiresAt} > NOW()`)
      .limit(1);
    return row[0] ?? null;
  }

  // Marks a token as used.
  async markConsumed(id: string) {
    await db.update(emailVerificationToken).set({ consumedAt: new Date() }).where(eq(emailVerificationToken.id, id));
  }

  // Retires outstanding tokens before issuing a new one so only one live link exists per user.
  async invalidateAllForUser(userId: string) {
    await db
      .update(emailVerificationToken)
      .set({ consumedAt: new Date() })
      .where(sql`${emailVerificationToken.userId} = ${userId} AND ${emailVerificationToken.consumedAt} IS NULL`);
  }
}

// Data access for password reset tokens.
export class PasswordResetTokenRepository {
  // Inserts a reset token.
  async create(data: typeof passwordResetToken.$inferInsert) {
    const row = await db.insert(passwordResetToken).values(data).returning();
    return row[0]!;
  }

  // Finds an unconsumed, unexpired reset token by its hash.
  async findValidByHash(tokenHash: string) {
    const row = await db
      .select()
      .from(passwordResetToken)
      .where(sql`${passwordResetToken.tokenHash} = ${tokenHash}
        AND ${passwordResetToken.consumedAt} IS NULL
        AND ${passwordResetToken.expiresAt} > NOW()`)
      .limit(1);
    return row[0] ?? null;
  }

  // Marks a reset token as used.
  async markConsumed(id: string) {
    await db.update(passwordResetToken).set({ consumedAt: new Date() }).where(eq(passwordResetToken.id, id));
  }

  // A fresh reset request retires every outstanding link, like the verification-token version.
  async invalidateAllForUser(userId: string) {
    await db
      .update(passwordResetToken)
      .set({ consumedAt: new Date() })
      .where(sql`${passwordResetToken.userId} = ${userId} AND ${passwordResetToken.consumedAt} IS NULL`);
  }
}

// Data access for account locks.
export class AccountLockRepository {
  // Finds a user's active lock.
  async findActiveByUser(userId: string) {
    const rows = await db
      .select()
      .from(accountLock)
      .where(
        and(
          eq(accountLock.userId, userId),
          eq(accountLock.isDeleted, false),
          sql`(${accountLock.lockedUntil} IS NULL OR ${accountLock.lockedUntil} > NOW())`,
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  // Inserts an account lock.
  async create(data: typeof accountLock.$inferInsert) {
    const row = await db.insert(accountLock).values(data).returning();
    return row[0]!;
  }

  // Soft-deletes an account lock.
  async softDelete(id: string) {
    await db
      .update(accountLock)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(eq(accountLock.id, id));
  }
}

// Data access for misconduct flags.
export class MisconductFlagRepository {
  // Lists a user's misconduct flags.
  async findByUser(userId: string) {
    return db
      .select()
      .from(misconductFlag)
      .where(eq(misconductFlag.flaggedUserId, userId));
  }

  // Inserts a misconduct flag.
  async create(data: typeof misconductFlag.$inferInsert) {
    const row = await db.insert(misconductFlag).values(data).returning();
    return row[0]!;
  }

  // Updates a misconduct flag.
  async update(id: string, data: Partial<typeof misconductFlag.$inferInsert>) {
    const row = await db.update(misconductFlag).set(data).where(eq(misconductFlag.id, id)).returning();
    return row[0] ?? null;
  }
}