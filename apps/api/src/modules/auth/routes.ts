import { Router } from "express";
import {
  registerHandler,
  loginHandler,
  logoutHandler,
  verifyMfaHandler,
  profileHandler,
} from "./controller.js";
import { requirePermission, requireAuthenticated } from "../../lib/rbac.js";
import { validateBody } from "../../lib/validation.js";
import { createRateLimiter } from "../../lib/rate-limit.js";
import { z } from "zod";

const authLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  device: z.string().trim().min(1).max(128).optional(),
  ip: z.string().trim().min(1).max(128).optional(),
});

const authRegisterSchema = authLoginSchema;

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
router.get("/auth/profile", requirePermission("user", "read"), profileHandler);

export { router as authRoutes };
