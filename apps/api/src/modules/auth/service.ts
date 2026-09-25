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
  EmailVerificationTokenRepository,
  PasswordResetTokenRepository,
} from "./repository.js";
import { User } from "./entities/User.js";
import { invalidatePermissionCache } from "../../lib/rbac.js";
import { resolveMfaRequirement } from "../../lib/mfa-policy.js";
// Cross-module coupling: login and logout are required audit events, so AuthService writes to the audit module.
import { auditService } from "../audit/index.js";
// Cross-module write through index.ts: registration stores intake for Regional Admin review and, after email verification, triggers auto-registration.
import {
  PatientRegistrationRequestRepository, PatientRepository, PatientService, generateUniquePatientId,
} from "../patient/index.js";
import { sendVerificationEmail } from "./services/VerificationEmailService.js";
import { sendPasswordResetEmail } from "./services/PasswordResetEmailService.js";
import { sendStaffInviteEmail } from "./services/StaffInviteEmailService.js";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// Decodes an RFC 4648 base32 string into bytes.
function base32Decode(input: string): Uint8Array {
  const padded = input.replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < padded.length; i++) {
    const char: string = padded[i]!.toUpperCase();
    const code = BASE32_ALPHABET.indexOf(char);
    if (code < 0) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | code;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

// Splits a full name into first and last name.
function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? fullName;
  const lastName = parts.slice(1).join(" ") || firstName;
  return { firstName, lastName };
}

// Audit writes are best-effort so a logging failure can't break a login or logout.
async function safeAuditLog(event: Parameters<typeof auditService.recordEvent>[0]): Promise<void> {
  try {
    await auditService.recordEvent(event);
  } catch {
    // best-effort only
  }
}

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
// Short verification-code lifetime, bounding how long a leaked or guessed 6-digit code is useful.
const EMAIL_VERIFICATION_TOKEN_TTL_MS = 10 * 60 * 1000;
// Reset links are shorter-lived than verification codes because they directly grant account takeover.
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
// A staff invite gives the new hire time to get to it, unlike a reset someone just asked for.
const STAFF_INVITE_TTL_MS = 72 * 60 * 60 * 1000;

// The roles a Regional Admin may create: the staff who work inside a facility. Roles above or beside the admin
// (SUPER_ADMIN, other admins, state/national directors) and PATIENT (self-registration) are never provisioned here.
export const PROVISIONABLE_ROLES = [
  "ONSITE_NURSING_OFFICER", "QUALITY_ASSURANCE_OFFICER", "VIRTUAL_MEDICAL_OFFICER",
  "CONSULTING_ONCOLOGIST", "CONSULTING_SURGEON", "CONSULTING_NUTRITIONIST", "CONSULTING_PSYCHO_ONCOLOGIST", "SCRIBE",
] as const;
export type ProvisionableRole = (typeof PROVISIONABLE_ROLES)[number];

// Business logic for registration, email verification, password reset, login, sessions and MFA.
export class AuthService {
  constructor(
    private userRepo = new UserRepository(),
    private sessionRepo = new SessionRepository(),
    private userRoleRepo = new UserRoleRepository(),
    private roleRepo = new RoleRepository(),
    private lockRepo = new AccountLockRepository(),
    private registrationRequestRepo = new PatientRegistrationRequestRepository(),
    private verificationTokenRepo = new EmailVerificationTokenRepository(),
    private passwordResetTokenRepo = new PasswordResetTokenRepository(),
    private patientRepo = new PatientRepository(),
    private patientSvc = new PatientService(),
  ) {}

  // Fire-and-forget: a delivery failure must never fail registration or resend, since the account is valid without a verified email.
  private async issueAndSendVerificationEmail(userId: string, email: string): Promise<void> {
    await this.verificationTokenRepo.invalidateAllForUser(userId);
    // 6-digit numeric code, hashed at rest; "token" in storage just means the secret, code or link.
    const rawToken = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await this.verificationTokenRepo.create({
      id: crypto.randomUUID(),
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
    });
    await sendVerificationEmail(email, rawToken);
  }

  // Public self-registration always grants PATIENT; staff accounts are provisioned separately.
  async register(
    email: string,
    password: string,
    _device: string,
    _ip: string,
    intake?: { fullName?: string; dob?: string; gender?: string; phone?: string; preferredFacilityId?: string },
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

    // Intake is optional: without a complete intake no registration request exists, so verification correctly won't auto-create a patient.
    if (intake?.fullName && intake.dob && intake.gender && intake.phone) {
      await this.registrationRequestRepo.create({
        id: crypto.randomUUID(),
        userId: userRow.id,
        email,
        fullName: intake.fullName,
        dob: intake.dob,
        gender: intake.gender,
        phone: intake.phone,
        preferredFacilityId: intake.preferredFacilityId ?? null,
      });
    }

    void this.issueAndSendVerificationEmail(userRow.id, email).catch((err) => {
      console.error(`Verification email failed for user ${userRow.id}:`, err);
    });

    return new User(userRow);
  }

  // Regional Admin creating a staff account: no password is chosen — the account starts with an unusable one and
  // the new hire gets an invite link to set their own. Provisioning is the only power here; the admin gets no
  // way to lock, unlock or impersonate the account afterwards.
  async provisionStaff(
    actorId: string,
    data: { email: string; firstName: string; lastName: string; role: ProvisionableRole; facilityId: string },
    ip?: string,
  ) {
    const email = data.email.trim().toLowerCase();
    if (await this.userRepo.findByEmail(email)) throw new Error("Email already registered");
    const roleRow = await this.roleRepo.findByName(data.role);
    if (!roleRow) throw new Error(`${data.role} role not seeded`);

    const userRow = await this.userRepo.create({
      id: crypto.randomUUID(), email, firstName: data.firstName.trim(), lastName: data.lastName.trim(),
      passwordHash: await User.hashPassword(crypto.randomBytes(32).toString("hex")),
      status: "ACTIVE", mfaEnabled: false, facilityId: data.facilityId,
    });
    await this.userRoleRepo.assign(userRow.id, roleRow.id);

    const rawToken = crypto.randomBytes(32).toString("hex");
    await this.passwordResetTokenRepo.create({
      id: crypto.randomUUID(), userId: userRow.id,
      tokenHash: crypto.createHash("sha256").update(rawToken).digest("hex"),
      expiresAt: new Date(Date.now() + STAFF_INVITE_TTL_MS),
    });
    let inviteSent = true;
    await sendStaffInviteEmail(email, rawToken, data.role.replace(/_/g, " ").toLowerCase()).catch((err) => {
      inviteSent = false;
      console.error(`Staff invite email failed for user ${userRow.id}:`, err);
    });
    await safeAuditLog({ actorId, action: "CREATE", resource: "staffAccount", resourceId: userRow.id, result: "ALLOWED", ip });
    return { user: new User(userRow), inviteSent };
  }

  // Verifies the emailed code, marks the email verified and attempts patient auto-registration.
  async verifyEmail(rawToken: string): Promise<void> {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const tokenRow = await this.verificationTokenRepo.findValidByHash(tokenHash);
    if (!tokenRow) {
      throw new Error("Invalid or expired verification code");
    }
    await this.userRepo.update(tokenRow.userId, { emailVerifiedAt: new Date() });
    await this.verificationTokenRepo.markConsumed(tokenRow.id);
    // Auto-registration is best-effort: the email is already verified and the token spent, so a failure (e.g. FR-01 duplicate) leaves the request for Admin instead of stranding the patient.
    try {
      await this.autoRegisterPatientIfPending(tokenRow.userId);
    } catch (err) {
      console.error(`Auto-registration after email verification failed for user ${tokenRow.userId}:`, err);
    }
  }

  // No-ops unless the user completed a patient self-registration and isn't already linked to a patient record.
  private async autoRegisterPatientIfPending(userId: string): Promise<void> {
    const requestRow = await this.registrationRequestRepo.findByUserId(userId);
    if (!requestRow || !requestRow.preferredFacilityId) return;

    const existingPatient = await this.patientRepo.findByUserId(userId);
    if (existingPatient) return;

    const { firstName, lastName } = splitFullName(requestRow.fullName);
    const uniquePatientId = await generateUniquePatientId();
    await this.patientSvc.registerPatient({
      uniquePatientId,
      firstName,
      lastName,
      dob: requestRow.dob,
      gender: requestRow.gender,
      phone: requestRow.phone,
      email: requestRow.email,
      facilityId: requestRow.preferredFacilityId,
      userId,
    });
  }

  // Re-sends the verification email for the caller's own unverified account.
  async resendVerificationEmail(userId: string): Promise<void> {
    const userRow = await this.userRepo.findById(userId);
    if (!userRow) {
      throw new Error("User not found");
    }
    if (userRow.emailVerifiedAt) {
      throw new Error("Email already verified");
    }
    await this.issueAndSendVerificationEmail(userId, userRow.email);
  }

  // Behaves identically whether or not the email belongs to an account, so callers can't enumerate registered emails.
  async requestPasswordReset(email: string): Promise<void> {
    const userRow = await this.userRepo.findByEmail(email);
    if (!userRow) return;

    await this.passwordResetTokenRepo.invalidateAllForUser(userRow.id);
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await this.passwordResetTokenRepo.create({
      id: crypto.randomUUID(),
      userId: userRow.id,
      tokenHash,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
    });
    await sendPasswordResetEmail(email, rawToken);
  }

  // Completes a password reset: consumes the token, sets the new password and revokes all sessions.
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const tokenRow = await this.passwordResetTokenRepo.findValidByHash(tokenHash);
    if (!tokenRow) {
      throw new Error("Invalid or expired reset link");
    }

    const passwordHash = await User.hashPassword(newPassword);
    await this.userRepo.update(tokenRow.userId, { passwordHash });
    await this.passwordResetTokenRepo.markConsumed(tokenRow.id);
    // Revokes every existing session so a stolen session can't outlive the compromised password.
    await this.sessionRepo.revokeAllForUser(tokenRow.userId);
  }

  // Authenticates by email and password, applies lock and MFA policy, and creates a session.
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

    const mfaRequirement = await resolveMfaRequirement(userRow.id, entity.mfaEnabled);

    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const sessionRow = await this.sessionRepo.create({
      id: crypto.randomUUID(),
      userId: userRow.id,
      device,
      ip,
      expiresAt,
      // A session starts MFA-verified only when MFA doesn't apply at all, so policy-required but unenrolled staff aren't pre-verified.
      mfaVerified: !mfaRequirement.required,
    });

    const roles = await this.userRoleRepo.findByUser(userRow.id);

    await safeAuditLog({ actorId: userRow.id, action: "LOGIN", resource: "auth", result: "ALLOWED", ip });

    return {
      sessionId: sessionRow.id,
      expiresAt: sessionRow.expiresAt,
      userId: userRow.id,
      mfaRequired: mfaRequirement.required,
      // Tells the client to route into enrolment rather than a code prompt when MFA is required but no secret exists.
      mfaEnrollmentPending: mfaRequirement.enrollmentPending,
      mfaVerified: sessionRow.mfaVerified,
      roles,
      user: entity.toSafeJSON(),
    };
  }

  // Revokes the session and audits the logout.
  async logout(sessionId: string) {
    const sessionRow = await this.sessionRepo.findById(sessionId);
    await this.sessionRepo.revoke(sessionId);
    if (sessionRow) {
      await safeAuditLog({ actorId: sessionRow.userId, action: "LOGOUT", resource: "auth", result: "ALLOWED" });
    }
  }

  // Returns the user, roles and MFA state for a session.
  async getSession(sessionId: string) {
    const row = await this.sessionRepo.findById(sessionId);
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      return null;
    }
    return row;
  }

  // Verifies a TOTP code for the session's user and marks the session MFA-verified.
  async verifyMfa(sessionId: string, code: string) {
    const row = await this.sessionRepo.findById(sessionId);
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      throw new Error("Session not found or expired");
    }

    const userRow = await this.userRepo.findById(row.userId);
    // Keyed on the secret rather than mfaEnabled, since during enrolment the secret exists while mfaEnabled is still false.
    if (!userRow || !userRow.mfaSecret) {
      throw new Error("MFA not enabled for this user");
    }

    const isValid = this.verifyTotp(code, userRow.mfaSecret);
    if (!isValid) {
      throw new Error("Invalid MFA code");
    }

    // First valid code against a pending secret completes enrolment.
    if (!userRow.mfaEnabled) {
      await this.userRepo.update(userRow.id, { mfaEnabled: true });
    }

    await db
      .update(session)
      .set({ mfaVerified: true })
      .where(sql`${session.id} = ${sessionId}`);

    return { mfaVerified: true };
  }

  // Verifies a 6-digit TOTP code (RFC 6238) allowing adjacent time steps.
  private verifyTotp(code: string, secretBase32: string): boolean {
    const secretBytes = base32Decode(secretBase32);
    const time = Math.floor(Date.now() / 1000 / 30);
    const data = Buffer.alloc(8);
    data.writeBigInt64BE(BigInt(time), 0);
const hmac = crypto.createHmac("sha1", secretBytes).update(data).digest();
    // Dynamic truncation: the offset is at most 15, so offset+3 always lies within the 20-byte SHA1 digest.
    const offset = (hmac[hmac.length - 1]! & 0xf);
    const b0 = hmac[offset]! & 0x7f;
    const b1 = hmac[offset + 1]! & 0xff;
    const b2 = hmac[offset + 2]! & 0xff;
    const b3 = hmac[offset + 3]! & 0xff;
    const binary = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >> 0;
    const otp = String(binary % 1000000).padStart(6, "0");
    return otp === code;
  }

  // Starts MFA enrolment by generating and storing a secret without enabling MFA.
  async enrollMfa(userId: string) {
    const userRow = await this.userRepo.findById(userId);
    if (!userRow) {
      throw new Error("User not found");
    }
    // Re-enrolling over a confirmed secret is refused so a hijacked session can't swap the second factor; replacing it is an admin reset.
    if (userRow.mfaEnabled) {
      throw new Error("MFA already enabled for this user");
    }

    // Two-phase enrolment: mfaEnabled stays false until a code is verified, so an unfinished enrolment can't lock the user out and can be retried.
    const secret = this.generateTotpSecret();
    await this.userRepo.update(userRow.id, { mfaSecret: secret });

    return { secret };
  }

  // Generates a random 10-byte TOTP secret as base32.
  private generateTotpSecret(): string {
    const bytes = crypto.randomBytes(10);
    return this.base32Encode(bytes);
  }

  // RFC 4648 base32 encoder streaming 5 bits at a time, the inverse of base32Decode, so authenticator apps derive the same key.
  private base32Encode(input: Buffer): string {
    let bits = 0;
    let value = 0;
    let result = "";
    for (const byte of input) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        result += BASE32_ALPHABET.charAt((value >> bits) & 0x1f);
      }
    }
    if (bits > 0) {
      result += BASE32_ALPHABET.charAt((value << (5 - bits)) & 0x1f);
    }
    // Pad to a multiple of 8 characters
    while (result.length % 8 !== 0) {
      result += "=";
    }
    return result;
  }

  // Returns the caller's profile with roles and permissions.
  async getProfile(userId: string) {
    const userRow = await this.userRepo.findById(userId);
    if (!userRow) {
      throw new Error("User not found");
    }
    const entity = new User(userRow);
    const roles = await this.userRoleRepo.findByUser(userId);
    return { user: entity.toSafeJSON(), roles };
  }

  // Sets the caller's own profile image to a file they uploaded, once it has passed the virus scan. Checked
  // with a direct query rather than the documents module, which would make this a module cycle.
  async setProfilePicture(userId: string, fileId: string) {
    const rows = await db.execute<{ uploaded_by: string; virus_scan_status: string; mime_type: string }>(
      sql`SELECT uploaded_by, virus_scan_status, mime_type FROM file WHERE id = ${fileId} AND is_deleted = false LIMIT 1`,
    );
    const f = rows[0];
    if (!f) throw new Error("File not found");
    if (f.uploaded_by !== userId) throw new Error("You can only use a file you uploaded");
    if (!f.mime_type.startsWith("image/")) throw new Error("A profile image must be an image");
    if (f.virus_scan_status !== "CLEAN") throw new Error("That file hasn't cleared the safety scan");
    await this.userRepo.setProfilePicture(userId, fileId);
    return this.getProfile(userId);
  }

  // Revokes all of a user's sessions.
  async invalidateSessions(userId: string) {
    await this.sessionRepo.revokeAllForUser(userId);
    await invalidatePermissionCache(userId);
  }
}