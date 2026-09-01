import { Router } from "express";
import {
  registerHandler,
  loginHandler,
  logoutHandler,
  verifyMfaHandler,
  profileHandler,
  listSessionsHandler,
  revokeSessionHandler,
  verifyEmailHandler,
  resendVerificationHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
} from "./controller.js";
import { requirePermission, requireAuthenticated, type AuthenticatedRequest } from "../../lib/rbac.js";
import { validateBody, validateParams } from "../../lib/validation.js";
import { createRateLimiter } from "../../lib/rate-limit.js";
import { z } from "zod";

const sessionIdParamSchema = z.object({
  id: z.string().uuid(),
});

const authLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  device: z.string().trim().min(1).max(128).optional(),
  ip: z.string().trim().min(1).max(128).optional(),
});

// Name/DOB/gender/phone/preferredFacilityId are optional here (a bare email+password
// registration still works) but the real registration wizard always sends them now — they're
// stored as a patient_registration_request row, and once the email is OTP-verified the same
// row is what AuthService.verifyEmail's auto-registration reads to create the real `patient`
// record immediately (request #5) — all four (name/dob/gender/facility) must be present for
// that to fire, matching what registerPatient() itself requires.
const authRegisterSchema = authLoginSchema.extend({
  fullName: z.string().trim().min(1).max(255).optional(),
  dob: z.string().trim().min(1).max(32).optional(),
  gender: z.string().trim().min(1).max(32).optional(),
  phone: z.string().trim().min(1).max(32).optional(),
  preferredFacilityId: z.string().uuid().optional(),
});

const verifyMfaSchema = z.object({
  sessionId: z.string().trim().uuid().optional(),
  code: z.string().trim().min(1).max(32),
});

const verifyEmailSchema = z.object({
  token: z.string().trim().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(8),
});

const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: "auth",
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase() : "";
    return `${req.ip}:${req.path}:${email}`;
  },
});

// Keyed by IP alone (no email in the verify-email body) — tighter than before now that the
// token is a 6-digit code (1M possibilities) rather than a 256-bit link, where the hash
// comparison alone made guessing infeasible. This is now real defense, not just extra caution:
// 8/15min per IP keeps bulk-guessing impractical while still covering a real user mistyping a
// couple of digits and retrying.
const verifyEmailRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyPrefix: "auth-verify-email",
});

// Keyed by the caller's own session (requireAuthenticated runs first), not IP — prevents a
// single logged-in account from hammering Resend, without punishing other users on the same IP.
const resendVerificationRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3,
  keyPrefix: "auth-resend-verify",
  keyGenerator: (req) => (req as AuthenticatedRequest).userId,
});

const mfaRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: "auth-mfa",
});

// Keyed by email like authRateLimiter — this is the one endpoint that runs a real DB lookup
// and enqueues a real send off a bare, unauthenticated email address, so it's the likeliest
// target for enumeration/spam abuse of anything added here.
const forgotPasswordRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: "auth-forgot-password",
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase() : "";
    return `${req.ip}:${email}`;
  },
});

// Keyed by IP alone, same reasoning as verifyEmailRateLimiter — no email in the body to key on,
// and the 256-bit token is the real defense; this just slows brute-force guessing.
const resetPasswordRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyPrefix: "auth-reset-password",
});

const router = Router();

// public — pre-authentication by definition, rate-limited above instead of permission-gated
router.post("/auth/register", authRateLimiter, validateBody(authRegisterSchema), registerHandler);
// public — same
router.post("/auth/login", authRateLimiter, validateBody(authLoginSchema), loginHandler);
// Logging yourself out shouldn't require a role-specific permission grant — any authenticated
// account can revoke its own session. (This bug was masked in tests until request-context.ts's
// TEST_USER_ID override was fixed to defer to a real session cookie when one is present.)
router.post("/auth/logout", requireAuthenticated(), logoutHandler);
// requireAuthenticated, not requirePermission("auth","update"): verifying your OWN second factor
// is self-service, the same class as /auth/logout — not something that should need a role grant.
// It previously required auth:update, which only SUPER_ADMIN implicitly has; that was harmless
// while MFA went unenforced, but the moment MFA is actually enforced it locks every other role
// out permanently (they can't reach the only route that would clear the MFA gate). The route is
// also MFA-exempt in rbac.ts for the same deadlock reason.
router.post("/auth/mfa/verify", mfaRateLimiter, requireAuthenticated(), validateBody(verifyMfaSchema), verifyMfaHandler);
// public — the token itself (256-bit, hashed at rest) is the credential; no session required,
// since the link may be opened on a different device than the one that registered.
router.post("/auth/verify-email", verifyEmailRateLimiter, validateBody(verifyEmailSchema), verifyEmailHandler);
// Self-service, same class as /auth/logout — resend for your own account only, never someone
// else's (no email param accepted; the target is always the caller's own session).
router.post("/auth/resend-verification", requireAuthenticated(), resendVerificationRateLimiter, resendVerificationHandler);
// public — pre-authentication by definition, same as register/login
router.post("/auth/forgot-password", forgotPasswordRateLimiter, validateBody(forgotPasswordSchema), forgotPasswordHandler);
// public — the token itself is the credential, same reasoning as /auth/verify-email
router.post("/auth/reset-password", resetPasswordRateLimiter, validateBody(resetPasswordSchema), resetPasswordHandler);
// Always your own profile (auth.getProfile uses the session's own userId, never a route param)
// — same "self-service, not a permission grant" pattern as GET /patients/me. Gating this behind
// a blanket user:read permission meant any account without that grant (e.g. PATIENT, which per
// seed/identity.ts intentionally gets none) got a 403 here forever, breaking session-recovery
// checks (page reload, or any client that resolves "am I logged in" via this endpoint).
router.get("/auth/profile", requireAuthenticated(), profileHandler);
// Self-service session management — list/revoke your own active sessions, same class as
// /auth/profile. Ownership of the target session is checked in the handler (revoking someone
// else's session isn't a "read your own data" case requireAuthenticated alone can express).
router.get("/auth/sessions", requireAuthenticated(), listSessionsHandler);
router.post("/auth/sessions/:id/revoke", requireAuthenticated(), validateParams(sessionIdParamSchema), revokeSessionHandler);

export { router as authRoutes };
