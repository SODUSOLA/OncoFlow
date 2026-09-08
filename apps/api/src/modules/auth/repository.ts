import { db } from "../../db/index.js";
import { eq, sql, and } from "drizzle-orm";
import {
  user, role, permission, userRole, rolePermission, session,
  accountLock, misconductFlag, emailVerificationToken, passwordResetToken,
} from "./schema.js";

export class UserRepository {
  async findById(id: string) {
    const row = await db.select().from(user).where(eq(user.id, id)).limit(1);
    return row[0] ?? null;
  }

  async findByEmail(email: string) {
    const row = await db
      .select()
      .from(user)
      .where(sql`${user.email} = ${email} AND ${user.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  async create(data: typeof user.$inferInsert) {
    const row = await db.insert(user).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof user.$inferInsert>) {
    const row = await db.update(user).set(data).where(eq(user.id, id)).returning();
    return row[0] ?? null;
  }

  async softDelete(id: string) {
    await db
      .update(user)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(eq(user.id, id));
  }

  // Backs Regional Admin's New Consultation consultant picker — every role name that starts
  // with CONSULTING_ (see db/enums.ts's roleNameEnum comment: one shared frontend view, several
  // distinct roles for specialty/display purposes), optionally narrowed to one facility.
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

export class RoleRepository {
  async findById(id: string) {
    const row = await db.select().from(role).where(eq(role.id, id)).limit(1);
    return row[0] ?? null;
  }

  async findByName(name: string) {
    const row = await db
      .select()
      .from(role)
      .where(sql`${role.name}::text = ${name}`)
      .limit(1);
    return row[0] ?? null;
  }

  async findAll() {
    return db.select().from(role);
  }
}

export class PermissionRepository {
  async findByResourceAction(resource: string, action: string) {
    const row = await db
      .select()
      .from(permission)
      .where(sql`${permission.resource} = ${resource} AND ${permission.action} = ${action}`)
      .limit(1);
    return row[0] ?? null;
  }

  async create(data: typeof permission.$inferInsert) {
    const row = await db.insert(permission).values(data).returning();
    return row[0]!;
  }
}

export class UserRoleRepository {
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

  async assign(userId: string, roleId: string) {
    const row = await db.insert(userRole).values({ userId, roleId }).returning();
    return row[0]!;
  }

  async remove(userId: string, roleId: string) {
    await db
      .delete(userRole)
      .where(sql`${userRole.userId} = ${userId} AND ${userRole.roleId} = ${roleId}`);
  }
}

export class RolePermissionRepository {
  async assign(roleId: string, permissionId: string) {
    const row = await db.insert(rolePermission).values({ roleId, permissionId }).returning();
    return row[0]!;
  }

  async remove(roleId: string, permissionId: string) {
    await db
      .delete(rolePermission)
      .where(sql`${rolePermission.roleId} = ${roleId} AND ${rolePermission.permissionId} = ${permissionId}`);
  }
}

export class SessionRepository {
  async findById(id: string) {
    const row = await db.select().from(session).where(eq(session.id, id)).limit(1);
    return row[0] ?? null;
  }

  async findActiveByUser(userId: string) {
    return db
      .select()
      .from(session)
      .where(sql`${session.userId} = ${userId} AND ${session.revokedAt} IS NULL AND ${session.expiresAt} > NOW()`)
      .orderBy(session.createdAt);
  }

  async create(data: typeof session.$inferInsert) {
    const row = await db.insert(session).values(data).returning();
    return row[0]!;
  }

  async revoke(id: string) {
    await db.update(session).set({ revokedAt: new Date() }).where(eq(session.id, id));
  }

  async revokeAllForUser(userId: string) {
    await db
      .update(session)
      .set({ revokedAt: new Date() })
      .where(sql`${session.userId} = ${userId} AND ${session.revokedAt} IS NULL`);
  }
}

export class EmailVerificationTokenRepository {
  async create(data: typeof emailVerificationToken.$inferInsert) {
    const row = await db.insert(emailVerificationToken).values(data).returning();
    return row[0]!;
  }

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

  async markConsumed(id: string) {
    await db.update(emailVerificationToken).set({ consumedAt: new Date() }).where(eq(emailVerificationToken.id, id));
  }

  // Called before issuing a fresh token (register's initial send, or a resend) so a user can
  // never have more than one live link outstanding — an old, still-emailed link should stop
  // working the moment a newer one is issued, not silently coexist with it.
  async invalidateAllForUser(userId: string) {
    await db
      .update(emailVerificationToken)
      .set({ consumedAt: new Date() })
      .where(sql`${emailVerificationToken.userId} = ${userId} AND ${emailVerificationToken.consumedAt} IS NULL`);
  }
}

export class PasswordResetTokenRepository {
  async create(data: typeof passwordResetToken.$inferInsert) {
    const row = await db.insert(passwordResetToken).values(data).returning();
    return row[0]!;
  }

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

  async markConsumed(id: string) {
    await db.update(passwordResetToken).set({ consumedAt: new Date() }).where(eq(passwordResetToken.id, id));
  }

  // Same reasoning as EmailVerificationTokenRepository.invalidateAllForUser — a fresh reset
  // request should retire every link still outstanding, not let an old, already-emailed one
  // keep working alongside the new one.
  async invalidateAllForUser(userId: string) {
    await db
      .update(passwordResetToken)
      .set({ consumedAt: new Date() })
      .where(sql`${passwordResetToken.userId} = ${userId} AND ${passwordResetToken.consumedAt} IS NULL`);
  }
}

export class AccountLockRepository {
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

  async create(data: typeof accountLock.$inferInsert) {
    const row = await db.insert(accountLock).values(data).returning();
    return row[0]!;
  }

  async softDelete(id: string) {
    await db
      .update(accountLock)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(eq(accountLock.id, id));
  }
}

export class MisconductFlagRepository {
  async findByUser(userId: string) {
    return db
      .select()
      .from(misconductFlag)
      .where(eq(misconductFlag.flaggedUserId, userId));
  }

  async create(data: typeof misconductFlag.$inferInsert) {
    const row = await db.insert(misconductFlag).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof misconductFlag.$inferInsert>) {
    const row = await db.update(misconductFlag).set(data).where(eq(misconductFlag.id, id)).returning();
    return row[0] ?? null;
  }
}