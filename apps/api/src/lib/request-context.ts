import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { SessionRepository, UserRepository } from "../modules/auth/index.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { config } from "../config.js";
import { resolveMfaRequirement } from "./mfa-policy.js";

const sessionRepo = new SessionRepository();
const userRepo = new UserRepository();

export async function attachRequestContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authed = req as Request & { userId?: string; facilityId?: string; mfaVerified?: boolean; mfaRequired?: boolean; };
  const contextReq = req as Request & { requestId?: string };

  const requestId = typeof req.headers["x-request-id"] === "string" && req.headers["x-request-id"].length > 0
    ? req.headers["x-request-id"]
    : crypto.randomUUID();
  contextReq.requestId = requestId;
  _res.setHeader("x-request-id", requestId);

  const isTest = config.isTest;

  // Real session cookie takes priority over the TEST_USER_ID/TEST_FACILITY_ID shortcut below —
  // a test that deliberately sets up its own cookie session (e.g. request-context.test.ts)
  // means to exercise that real path, not have it silently pre-empted by unrelated global
  // test scaffolding (src/test/setup.ts sets TEST_USER_ID for every test file unconditionally).
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

  // Load MFA state for enforcement. `required` comes from lib/mfa-policy.ts rather than
  // user.mfaEnabled directly, so a staff account that policy requires to use MFA but has not
  // enrolled yet is still gated — reading mfaEnabled alone would let exactly those accounts
  // (the ones the policy exists for) straight through.
  if (authed.userId) {
    const userRow = await userRepo.findById(authed.userId);
    const requirement = await resolveMfaRequirement(authed.userId, userRow?.mfaEnabled ?? false);
    authed.mfaRequired = requirement.required;
    // No session cookie (test mode, or stale state) means nothing has been verified.
    authed.mfaVerified = session ? session.mfaVerified : false;
  }

  next();
}
