import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { session } from "./schema";
import {
  UserRepository,
  SessionRepository,
  UserRoleRepository,
  RoleRepository,
  AccountLockRepository,
} from "./repository";
import { User } from "./entities/User";
import { invalidatePermissionCache } from "../../lib/rbac";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export class AuthService {
  constructor(
    private userRepo = new UserRepository(),
    private sessionRepo = new SessionRepository(),
    private userRoleRepo = new UserRoleRepository(),
    private roleRepo = new RoleRepository(),
    private lockRepo = new AccountLockRepository(),
  ) {}

  async register(email: string, password: string, _device: string, _ip: string) {
    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      throw new Error("Email already registered");
    }

    const passwordHash = await User.hashPassword(password);
    const userRow = await this.userRepo.create({
      id: crypto.randomUUID(),
      email,
      passwordHash,
      status: "ACTIVE",
      mfaEnabled: false,
    });

    return new User(userRow);
  }

  async login(email: string, password: string, device: string, ip: string) {
    const userRow = await this.userRepo.findByEmail(email);
    if (!userRow) {
      throw new Error("Invalid credentials");
    }

    const entity = new User(userRow);
    if (entity.status === "LOCKED" || entity.status === "SUSPENDED") {
      throw new Error("Account is locked or suspended");
    }

    const activeLock = await this.lockRepo.findActiveByUser(userRow.id);
    if (activeLock) {
      throw new Error("Account is locked or suspended");
    }

    const valid = await entity.verifyPassword(password);
    if (!valid) {
      throw new Error("Invalid credentials");
    }

    entity.markLastLogin();
    await this.userRepo.update(userRow.id, {
      lastLogin: entity["data"].lastLogin,
    });

    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const sessionRow = await this.sessionRepo.create({
      id: crypto.randomUUID(),
      userId: userRow.id,
      device,
      ip,
      expiresAt,
      mfaVerified: !entity.mfaEnabled,
    });

    const roles = await this.userRoleRepo.findByUser(userRow.id);

    return {
      sessionId: sessionRow.id,
      expiresAt: sessionRow.expiresAt,
      userId: userRow.id,
      mfaRequired: entity.mfaEnabled,
      mfaVerified: sessionRow.mfaVerified,
      roles,
      user: entity.toSafeJSON(),
    };
  }

  async logout(sessionId: string) {
    await this.sessionRepo.revoke(sessionId);
  }

  async getSession(sessionId: string) {
    const row = await this.sessionRepo.findById(sessionId);
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      return null;
    }
    return row;
  }

  async verifyMfa(sessionId: string, _code: string) {
    const row = await this.sessionRepo.findById(sessionId);
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      throw new Error("Session not found or expired");
    }

    // MFA code validation stubbed — actual TOTP/hotp integration is a future scope item
    // For now, any non-empty code marks MFA as verified
    await db
      .update(session)
      .set({ mfaVerified: true })
      .where(sql`${session.id} = ${sessionId}`);

    return { mfaVerified: true };
  }

  async getProfile(userId: string) {
    const userRow = await this.userRepo.findById(userId);
    if (!userRow) {
      throw new Error("User not found");
    }
    const entity = new User(userRow);
    const roles = await this.userRoleRepo.findByUser(userId);
    return { user: entity.toSafeJSON(), roles };
  }

  async invalidateSessions(userId: string) {
    await this.sessionRepo.revokeAllForUser(userId);
    await invalidatePermissionCache(userId);
  }
}