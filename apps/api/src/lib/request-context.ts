import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { SessionRepository, UserRepository } from "../modules/auth/index.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { config } from "../config.js";
import { resolveMfaRequirement } from "./mfa-policy.js";

const sessionRepo = new SessionRepository();
const userRepo = new UserRepository();

// Middleware that resolves the session cookie into req.userId, facilityId and MFA state for later gates.
export async function attachRequestContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authed = req as Request & { userId?: string; facilityId?: string; mfaVerified?: boolean; mfaRequired?: boolean; };
  const contextReq = req as Request & { requestId?: string };

  const requestId = typeof req.headers["x-request-id"] === "string" && req.headers["x-request-id"].length > 0
    ? req.headers["x-request-id"]
    : crypto.randomUUID();
  contextReq.requestId = requestId;
  _res.setHeader("x-request-id", requestId);

  const isTest = config.isTest;

  // A real session cookie takes priority over the TEST_USER_ID shortcut so tests that set up their own cookie exercise the real path.
  const sessionIdFromCookie = typeof req.cookies?.[SESSION_COOKIE_NAME] === "string"
    ? req.cookies[SESSION_COOKIE_NAME]
    : undefined;
  let session = null;
  if (typeof sessionIdFromCookie === "string" && sessionIdFromCookie.length > 0) {
    session = await sessionRepo.findById(sessionIdFromCookie);
    if (session && !session.revokedAt && session.expiresAt > new Date()) {
      authed.userId = session.userId;
    }
  }

  if (!authed.userId && isTest && process.env.TEST_USER_ID) {
    authed.userId = process.env.TEST_USER_ID;
  }
  if (!authed.facilityId && isTest && process.env.TEST_FACILITY_ID) {
    authed.facilityId = process.env.TEST_FACILITY_ID;
  }

  // Derive facility from user DB record for RBAC scoping — skipped when test already set it
  if (authed.userId && !authed.facilityId) {
    const userRow = await userRepo.findById(authed.userId);
    if (userRow?.facilityId) {
      authed.facilityId = userRow.facilityId;
    }
  }

  // MFA "required" comes from the policy layer, not user.mfaEnabled alone, so unenrolled staff that policy requires are still gated.
  if (authed.userId) {
    const userRow = await userRepo.findById(authed.userId);
    const requirement = await resolveMfaRequirement(authed.userId, userRow?.mfaEnabled ?? false);
    authed.mfaRequired = requirement.required;
    // No session cookie (test mode, or stale state) means nothing has been verified.
    authed.mfaVerified = session ? session.mfaVerified : false;
  }

  next();
}
