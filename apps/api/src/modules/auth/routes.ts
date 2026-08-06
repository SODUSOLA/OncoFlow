import { Router } from "express";
import {
  registerHandler,
  loginHandler,
  logoutHandler,
  verifyMfaHandler,
  profileHandler,
  listSessionsHandler,
  revokeSessionHandler,
} from "./controller.js";
import { requirePermission, requireAuthenticated } from "../../lib/rbac.js";
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

// Name/DOB/phone/preferredFacilityId are optional here (a bare email+password registration
// still works) but the real registration wizard always sends them now — they're stored as a
// patient_registration_request row for a Regional Admin to review, not written to `patient`
// directly (self-reported intake data isn't the authoritative clinical record until approved).
const authRegisterSchema = authLoginSchema.extend({
  fullName: z.string().trim().min(1).max(255).optional(),
  dob: z.string().trim().min(1).max(32).optional(),
  phone: z.string().trim().min(1).max(32).optional(),
  preferredFacilityId: z.string().uuid().optional(),
});

const verifyMfaSchema = z.object({
  sessionId: z.string().trim().uuid().optional(),
  code: z.string().trim().min(1).max(32),
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

const mfaRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: "auth-mfa",
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
router.post("/auth/mfa/verify", mfaRateLimiter, requirePermission("auth", "update"), validateBody(verifyMfaSchema), verifyMfaHandler);
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
