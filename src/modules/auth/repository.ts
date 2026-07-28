import { db } from "../../db";
import { eq, sql, and } from "drizzle-orm";
import {
  user, role, permission, userRole, rolePermission, session,
  accountLock, misconductFlag,
} from "./schema";

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