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
// Cross-module coupling (global-conventions.md §2): login/logout are explicitly-required
// audit events, so AuthService is one of the few callers of AuditService besides rbac.ts.
import { auditService } from "../audit/index.js";
// Cross-module write (through index.ts, per .dependency-cruiser.js): registration captures
// self-reported intake data for a Regional Admin to review — see patient/schema.ts's
// patientRegistrationRequest comment for why this isn't written straight to `patient`.
// The same cross-module direction (auth -> patient) now also carries the auto-registration
// call in verifyEmail below, once email OTP verification succeeds.
import {
  PatientRegistrationRequestRepository, PatientRepository, PatientService, generateUniquePatientId,
} from "../patient/index.js";
import { sendVerificationEmail } from "./services/VerificationEmailService.js";
import { sendPasswordResetEmail } from "./services/PasswordResetEmailService.js";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

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

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? fullName;
  const lastName = parts.slice(1).join(" ") || firstName;
  return { firstName, lastName };
}

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
// A 6-digit code meant to be typed in immediately doesn't need the old link's 24h window — a
// short TTL bounds how long a leaked/guessed code is useful, on top of the rate limiting on
// both the verify route (auth/routes.ts) and the per-account resend limiter below.
const EMAIL_VERIFICATION_TOKEN_TTL_MS = 10 * 60 * 1000;
// Shorter than the email-verification window — a reset link is a more sensitive credential
// (it directly grants account takeover, not just email confirmation), so it stays valid for a
// single sitting rather than a full day.
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

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

  // Fire-and-forget, same tolerance as PaymentService's receipt email (billing/services/
  // PaymentService.ts) — a delivery failure here must never fail the registration/resend
  // response, since the account itself is already valid without a verified email.
  private async issueAndSendVerificationEmail(userId: string, email: string): Promise<void> {
    await this.verificationTokenRepo.invalidateAllForUser(userId);
    // 6-digit numeric code (request #4) — hashed at rest the same way the old 32-byte link
    // token was; "token" in storage/verifyEmail below just means "the secret", link or code.
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

  // Public self-registration (apps/web's "Register as Patient" flow, the only real caller of
  // this endpoint today) — every account created here is a patient until something else
  // needs this endpoint for a different kind of signup, so grant PATIENT unconditionally.
  // Staff accounts are provisioned separately (seed scripts / admin action), not through here.
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

    // Optional: a bare email+password registration (e.g. a script, or a future non-patient
    // signup path) still works without ever creating a registration request — and, per
    // verifyEmail below, without ever auto-creating a patient record (that only fires off the
    // presence of this row, so an incomplete intake correctly no-ops instead of half-registering
    // someone with a missing gender/facility).
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

  async verifyEmail(rawToken: string): Promise<void> {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const tokenRow = await this.verificationTokenRepo.findValidByHash(tokenHash);
    if (!tokenRow) {
      throw new Error("Invalid or expired verification code");
    }
    await this.userRepo.update(tokenRow.userId, { emailVerifiedAt: new Date() });
    await this.verificationTokenRepo.markConsumed(tokenRow.id);
    // Request #5: a verified patient shouldn't wait on Admin to get a working account — the
    // Unique Patient ID is still generated server-side (generateUniquePatientId), never by the
    // client, so this preserves the original anti-self-assignment property while moving *when*
    // it happens from admin-review time to right here.
    //
    // Deliberately best-effort rather than fatal. By this point the email genuinely IS verified
    // and the token is spent, so rethrowing would strand the patient in a dead end: they can't
    // re-verify (token consumed) and can't resend (resendVerificationEmail refuses once
    // emailVerifiedAt is set). Instead the account stays valid-but-unlinked — exactly the
    // `notLinked` state apps/web's useMyPatient already handles — and the registration request
    // stays in Admin's queue to resolve by hand. The realistic trigger is registerPatient's own
    // FR-01 duplicate-identity guard (same name + DOB + facility as an existing patient), which
    // is precisely a case that *needs* a human, not a retry.
    try {
      await this.autoRegisterPatientIfPending(tokenRow.userId);
    } catch (err) {
      console.error(`Auto-registration after email verification failed for user ${tokenRow.userId}:`, err);
    }
  }

  // No-ops for anything that isn't a completed patient self-registration: a bare email+password
  // signup never got a patientRegistrationRequest row (register() above), and re-verifying an
  // already-linked account is a no-op too (patientRepo.findByUserId short-circuits it).
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

  // Deliberately never reveals whether `email` belongs to an account — same shape regardless
  // of outcome (no token issued, no email sent, no error thrown) for a nonexistent address, so
  // a caller can't enumerate registered emails through this endpoint. The frontend's own copy
  // ("If an account exists for X, we've sent...") already assumes this.
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

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const tokenRow = await this.passwordResetTokenRepo.findValidByHash(tokenHash);
    if (!tokenRow) {
      throw new Error("Invalid or expired reset link");
    }

    const passwordHash = await User.hashPassword(newPassword);
    await this.userRepo.update(tokenRow.userId, { passwordHash });
    await this.passwordResetTokenRepo.markConsumed(tokenRow.id);
    // A password reset is the strongest signal available that the previous credential may be
    // compromised (or the account holder locked themselves out) — every existing session gets
    // invalidated so a stolen session can't outlive the password that issued it.
    await this.sessionRepo.revokeAllForUser(tokenRow.userId);
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

    const mfaRequirement = await resolveMfaRequirement(userRow.id, entity.mfaEnabled);

    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const sessionRow = await this.sessionRepo.create({
      id: crypto.randomUUID(),
      userId: userRow.id,
      device,
      ip,
      expiresAt,
      // A session starts MFA-satisfied only when MFA does not apply at all. Deriving this from
      // entity.mfaEnabled alone predated the role policy: a staff account that policy requires
      // to use MFA but has not enrolled yet has mfaEnabled=false, and would have been handed a
      // pre-verified session — i.e. the policy would have been silently unenforceable.
      mfaVerified: !mfaRequirement.required,
    });

    const roles = await this.userRoleRepo.findByUser(userRow.id);

    await safeAuditLog({ actorId: userRow.id, action: "LOGIN", resource: "auth", result: "ALLOWED", ip });

    return {
      sessionId: sessionRow.id,
      expiresAt: sessionRow.expiresAt,
      userId: userRow.id,
      mfaRequired: mfaRequirement.required,
      // Tells the client to route the user into enrolment rather than a code prompt: MFA is
      // required for them, but there is no secret to generate a code from yet.
      mfaEnrollmentPending: mfaRequirement.enrollmentPending,
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

  async verifyMfa(sessionId: string, code: string) {
    const row = await this.sessionRepo.findById(sessionId);
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      throw new Error("Session not found or expired");
    }

    const userRow = await this.userRepo.findById(row.userId);
    // Keyed on the presence of a secret rather than on mfaEnabled: during enrolment the secret
    // exists while mfaEnabled is still false, and this endpoint is what confirms it.
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

  private verifyTotp(code: string, secretBase32: string): boolean {
    const secretBytes = base32Decode(secretBase32);
    const time = Math.floor(Date.now() / 1000 / 30);
    const data = Buffer.alloc(8);
    data.writeBigInt64BE(BigInt(time), 0);
const hmac = crypto.createHmac("sha1", secretBytes).update(data).digest();
    // SHA1 produces 20 bytes; offset is 0-15 (from lower 4 bits of last byte)
    // Accessing offset+3 is always safe since offset <= 15 and hmac.length = 20
    const offset = (hmac[hmac.length - 1]! & 0xf);
    const b0 = hmac[offset]! & 0x7f;
    const b1 = hmac[offset + 1]! & 0xff;
    const b2 = hmac[offset + 2]! & 0xff;
    const b3 = hmac[offset + 3]! & 0xff;
    const binary = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >> 0;
    const otp = String(binary % 1000000).padStart(6, "0");
    return otp === code;
  }

  async enrollMfa(userId: string) {
    const userRow = await this.userRepo.findById(userId);
    if (!userRow) {
      throw new Error("User not found");
    }
    // Re-enrolling over an already-confirmed secret is refused: anyone holding a live session
    // cookie could otherwise swap the second factor for one of their own, which turns MFA into
    // a formality. Replacing a confirmed factor is an admin reset, not a self-service action.
    if (userRow.mfaEnabled) {
      throw new Error("MFA already enabled for this user");
    }

    // Two-phase enrolment: store the secret but leave mfaEnabled false until the user proves
    // they can generate a code from it (verifyMfa completes it). Enabling here instead would
    // strand anyone who requested a secret and never finished adding it to their authenticator
    // — MFA would be "on" against a secret they do not hold, with no way back in. Leaving it
    // false also makes an unconfirmed secret safely re-issuable on a retry.
    const secret = this.generateTotpSecret();
    await this.userRepo.update(userRow.id, { mfaSecret: secret });

    return { secret };
  }

  private generateTotpSecret(): string {
    const bytes = crypto.randomBytes(10);
    return this.base32Encode(bytes);
  }

  // RFC 4648 base32. The previous implementation emitted two characters per input byte
  // (top 5 bits, then 3 low bits merged with the next byte's top 3), which is not base32 at
  // all: it produced 20 characters for a 10-byte secret where the standard produces 16, and
  // base32Decode(base32Encode(x)) did not return x. That made TOTP unusable in practice —
  // an authenticator app decodes the stored secret per RFC 4648 and derives one key, while
  // verifyTotp() decoded the same string with the (correct) standard decoder above and got a
  // different one, so a correctly-typed code could never match. Streaming 5 bits at a time,
  // the inverse of base32Decode, is what makes the two halves agree and interoperate with
  // Google Authenticator / Authy / 1Password.
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