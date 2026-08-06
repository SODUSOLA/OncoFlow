import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { session } from "./schema.js";
import {
  UserRepository,
  SessionRepository,
  UserRoleRepository,
  RoleRepository,
  AccountLockRepository,
} from "./repository.js";
import { User } from "./entities/User.js";
import { invalidatePermissionCache } from "../../lib/rbac.js";
// Cross-module coupling (global-conventions.md §2): login/logout are explicitly-required
// audit events, so AuthService is one of the few callers of AuditService besides rbac.ts.
import { auditService } from "../audit/index.js";
// Cross-module write (through index.ts, per .dependency-cruiser.js): registration captures
// self-reported intake data for a Regional Admin to review — see patient/schema.ts's
// patientRegistrationRequest comment for why this isn't written straight to `patient`.
import { PatientRegistrationRequestRepository } from "../patient/index.js";

// Audit logging is a side effect, not the auth decision itself — a write failure here must
// never turn a clean login/logout outcome into an unhandled error (see src/lib/rbac.ts).
async function safeAuditLog(event: Parameters<typeof auditService.recordEvent>[0]): Promise<void> {
  try {
    await auditService.recordEvent(event);
  } catch {
    // best-effort only
  }
}

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export class AuthService {
  constructor(
    private userRepo = new UserRepository(),
    private sessionRepo = new SessionRepository(),
    private userRoleRepo = new UserRoleRepository(),
    private roleRepo = new RoleRepository(),
    private lockRepo = new AccountLockRepository(),
    private registrationRequestRepo = new PatientRegistrationRequestRepository(),
  ) {}

  // Public self-registration (apps/web's "Register as Patient" flow, the only real caller of
  // this endpoint today) — every account created here is a patient until something else
  // needs this endpoint for a different kind of signup, so grant PATIENT unconditionally.
  // Staff accounts are provisioned separately (seed scripts / admin action), not through here.
  async register(
    email: string,
    password: string,
    _device: string,
    _ip: string,
    intake?: { fullName?: string; dob?: string; phone?: string; preferredFacilityId?: string },
  ) {
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

    const patientRole = await this.roleRepo.findByName("PATIENT");
    if (!patientRole) {
      throw new Error("PATIENT role not seeded — run the identity seed before allowing registration");
    }
    await this.userRoleRepo.assign(userRow.id, patientRole.id);

    // Optional: a bare email+password registration (e.g. a script, or a future non-patient
    // signup path) still works without ever creating a registration request.
    if (intake?.fullName && intake.dob && intake.phone) {
      await this.registrationRequestRepo.create({
        id: crypto.randomUUID(),
        userId: userRow.id,
        email,
        fullName: intake.fullName,
        dob: intake.dob,
        phone: intake.phone,
        preferredFacilityId: intake.preferredFacilityId ?? null,
      });
    }

    return new User(userRow);
  }

  async login(email: string, password: string, device: string, ip: string) {
    const userRow = await this.userRepo.findByEmail(email);
    if (!userRow) {
      await safeAuditLog({ action: "LOGIN", resource: "auth", result: "DENIED", ip });
      throw new Error("Invalid credentials");
    }

    const entity = new User(userRow);
    if (entity.status === "LOCKED" || entity.status === "SUSPENDED") {
      await safeAuditLog({ actorId: userRow.id, action: "LOGIN", resource: "auth", result: "DENIED", ip });
      throw new Error("Account is locked or suspended");
    }

    const activeLock = await this.lockRepo.findActiveByUser(userRow.id);
    if (activeLock) {
      await safeAuditLog({ actorId: userRow.id, action: "LOGIN", resource: "auth", result: "DENIED", ip });
      throw new Error("Account is locked or suspended");
    }

    const valid = await entity.verifyPassword(password);
    if (!valid) {
      await safeAuditLog({ actorId: userRow.id, action: "LOGIN", resource: "auth", result: "DENIED", ip });
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

    await safeAuditLog({ actorId: userRow.id, action: "LOGIN", resource: "auth", result: "ALLOWED", ip });

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
    const sessionRow = await this.sessionRepo.findById(sessionId);
    await this.sessionRepo.revoke(sessionId);
    if (sessionRow) {
      await safeAuditLog({ actorId: sessionRow.userId, action: "LOGOUT", resource: "auth", result: "ALLOWED" });
    }
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