import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { SessionRepository, UserRepository } from "../modules/auth/index.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";

const sessionRepo = new SessionRepository();
const userRepo = new UserRepository();

export async function attachRequestContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authed = req as Request & { userId?: string; facilityId?: string };
  const contextReq = req as Request & { requestId?: string };

  const requestId = typeof req.headers["x-request-id"] === "string" && req.headers["x-request-id"].length > 0
    ? req.headers["x-request-id"]
    : crypto.randomUUID();
  contextReq.requestId = requestId;
  _res.setHeader("x-request-id", requestId);

  const isTest = process.env.NODE_ENV === "test";

  if (isTest && process.env.TEST_USER_ID) {
    authed.userId = process.env.TEST_USER_ID;
  }
  if (isTest && process.env.TEST_FACILITY_ID) {
    authed.facilityId = process.env.TEST_FACILITY_ID;
  }

  if (!authed.userId) {
    const sessionIdFromCookie = typeof req.cookies?.[SESSION_COOKIE_NAME] === "string"
      ? req.cookies[SESSION_COOKIE_NAME]
      : undefined;
    if (typeof sessionIdFromCookie === "string" && sessionIdFromCookie.length > 0) {
      const session = await sessionRepo.findById(sessionIdFromCookie);
      if (session && !session.revokedAt && session.expiresAt > new Date()) {
        authed.userId = session.userId;
      }
    }
  }

  // Facility-scoped RBAC (rbac.ts requirePermissionScoped) needs the requesting user's own
  // facility to compare against a resource's facility_id — derive it from the DB rather than
  // trusting anything client-supplied. Skipped when a test already set it directly above.
  if (authed.userId && !authed.facilityId) {
    const userRow = await userRepo.findById(authed.userId);
    if (userRow?.facilityId) {
      authed.facilityId = userRow.facilityId;
    }
  }

  next();
}
