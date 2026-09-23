import { Router } from "express";
import {
  registerHandler,
  loginHandler,
  logoutHandler,
  enrollMfaHandler,
  verifyMfaHandler,
  profileHandler,
  listSessionsHandler,
  revokeSessionHandler,
  verifyEmailHandler,
  resendVerificationHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
  listConsultantsHandler,
} from "./controller.js";
import { requireAuthenticated, requirePermission, type AuthenticatedRequest } from "../../lib/rbac.js";
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

// Profile fields are optional, but when name, DOB, gender and facility are all sent they become the intake snapshot that drives auto-registration after email verification.
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

// Keyed by IP alone with a tight 8/15min budget, since the 6-digit code is only guarded by rate limiting.
const verifyEmailRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyPrefix: "auth-verify-email",
});

// Keyed by the caller's session rather than IP, so one account can't hammer Resend without punishing others on its IP.
const resendVerificationRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3,
  keyPrefix: "auth-resend-verify",
  keyGenerator: (req) => (req as AuthenticatedRequest).userId,
});

// Keyed per account because TOTP brute-forcing targets one account and IP buckets are cheap to rotate or exhaust by shared clinic IPs.
const mfaRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: "auth-mfa",
  keyGenerator: (req) => (req as AuthenticatedRequest).userId,
});

// Keyed by email because this unauthenticated endpoint does a real lookup and send, making it the likeliest enumeration or spam target.
const forgotPasswordRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: "auth-forgot-password",
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase() : "";
    return `${req.ip}:${email}`;
  },
});

// Keyed by IP alone (no email in the body); the 256-bit token is the real defense and this just slows guessing.
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
// Logging out needs no role grant: any authenticated account can revoke its own session.
router.post("/auth/logout", requireAuthenticated(), logoutHandler);
// Self-service MFA enrolment: authenticated only, MFA-exempt, and rate-limited since each call mints a secret; a role grant would deadlock accounts required to enrol.
router.post("/auth/mfa/enroll", requireAuthenticated(), mfaRateLimiter, enrollMfaHandler);
// Verifies the caller's own TOTP; self-service and MFA-exempt.
router.post("/auth/mfa/verify", requireAuthenticated(), mfaRateLimiter, validateBody(verifyMfaSchema), verifyMfaHandler);
// Public because the hashed token is the credential and the link may open on another device.
router.post("/auth/verify-email", verifyEmailRateLimiter, validateBody(verifyEmailSchema), verifyEmailHandler);
// Self-service: only ever resends for the caller's own session, never an arbitrary email.
router.post("/auth/resend-verification", requireAuthenticated(), resendVerificationRateLimiter, resendVerificationHandler);
// public — pre-authentication by definition, same as register/login
router.post("/auth/forgot-password", forgotPasswordRateLimiter, validateBody(forgotPasswordSchema), forgotPasswordHandler);
// public — the token itself is the credential, same reasoning as /auth/verify-email
router.post("/auth/reset-password", resetPasswordRateLimiter, validateBody(resetPasswordSchema), resetPasswordHandler);
// Always the caller's own profile, so it needs a session rather than a grant, or PATIENT accounts get 403s on session-recovery checks.
router.get("/auth/profile", requireAuthenticated(), profileHandler);
// Consultant picker for the New Consultation flow.
router.get("/consultants", requirePermission("appointment", "create"), listConsultantsHandler);
// Self-service session list; ownership of a target session is checked in the handler.
router.get("/auth/sessions", requireAuthenticated(), listSessionsHandler);
// Revokes one of the caller's own sessions.
router.post("/auth/sessions/:id/revoke", requireAuthenticated(), validateParams(sessionIdParamSchema), revokeSessionHandler);

export { router as authRoutes };
