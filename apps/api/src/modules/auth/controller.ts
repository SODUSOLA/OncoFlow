import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { AuthService } from "./service.js";
import { SessionRepository, UserRepository } from "./repository.js";
import { SESSION_COOKIE_NAME, getSessionCookieOptions, getClearSessionCookieOptions } from "../../lib/session-cookie.js";

const auth = new AuthService();
const sessionRepo = new SessionRepository();
const userRepo = new UserRepository();

// Consultant picker for Regional Admin's New Consultation flow, gated by appointment:create rather than a broad staff-directory permission.
export async function listConsultantsHandler(req: Request, res: Response) {
  try {
    const facilityId = typeof req.query.facilityId === "string" ? req.query.facilityId : undefined;
    const rows = await userRepo.findConsultants(facilityId);
    res.json({ consultants: rows.map((r) => ({ id: r.id, email: r.email, facilityId: r.facility_id, roleName: r.role_name })) });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Registers a new account and starts email verification.
export async function registerHandler(req: Request, res: Response) {
  try {
    const { email, password, device, fullName, dob, gender, phone, preferredFacilityId } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }
    const user = await auth.register(email, password, device ?? "unknown", req.ip ?? "unknown", {
      fullName, dob, gender, phone, preferredFacilityId,
    });
    res.status(201).json({ user: user.toSafeJSON() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message === "Email already registered" ? 409 : 400;
    res.status(status).json({ error: message });
  }
}

// Verifies an email with the 6-digit code.
export async function verifyEmailHandler(req: Request, res: Response) {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: "Token required" });
      return;
    }
    await auth.verifyEmail(token);
    res.json({ verified: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(400).json({ error: message });
  }
}

// Re-sends the verification email for the caller's own account.
export async function resendVerificationHandler(req: Request, res: Response) {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    await auth.resendVerificationEmail(userId);
    res.json({ sent: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message === "Email already verified" ? 409 : 400;
    res.status(status).json({ error: message });
  }
}

// Starts a password reset for the given email.
export async function forgotPasswordHandler(req: Request, res: Response) {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: "Email required" });
      return;
    }
    await auth.requestPasswordReset(email);
    // Always 200 with the same body whether or not the account exists, to avoid account enumeration.
    res.json({ sent: true });
  } catch {
    // The generic 500 body reveals nothing that distinguishes it from the "no such account" success.
    res.status(500).json({ error: "Internal server error" });
  }
}

// Completes a password reset with the emailed token.
export async function resetPasswordHandler(req: Request, res: Response) {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      res.status(400).json({ error: "Token and password required" });
      return;
    }
    await auth.resetPassword(token, password);
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(400).json({ error: message });
  }
}

// Logs in with email and password and sets the session cookie.
export async function loginHandler(req: Request, res: Response) {
  try {
    const { email, password, device } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }
    const result = await auth.login(email, password, device ?? "unknown", req.ip ?? "unknown");
    res.cookie(SESSION_COOKIE_NAME, result.sessionId, getSessionCookieOptions());
    res.json({
      mfaRequired: result.mfaRequired,
      mfaEnrollmentPending: result.mfaEnrollmentPending,
      mfaVerified: result.mfaVerified,
      userId: result.userId,
      roles: result.roles,
      user: result.user,
    });
  } catch {
    res.status(401).json({ error: "Invalid email or password" });
  }
}

// Revokes the current session and clears the cookie.
export async function logoutHandler(req: Request, res: Response) {
  try {
    const cookieSessionId = typeof req.cookies?.[SESSION_COOKIE_NAME] === "string"
      ? req.cookies[SESSION_COOKIE_NAME]
      : undefined;
    if (!cookieSessionId) {
      res.status(400).json({ error: "Session ID required" });
      return;
    }
    await auth.logout(cookieSessionId);
    res.clearCookie(SESSION_COOKIE_NAME, getClearSessionCookieOptions());
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Starts MFA enrolment by generating a secret for the caller.
export async function enrollMfaHandler(req: Request, res: Response) {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const result = await auth.enrollMfa(userId);
    res.json({ mfaEnabled: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(400).json({ error: message });
  }
}

// Verifies a TOTP code and marks the session as MFA-verified.
export async function verifyMfaHandler(req: Request, res: Response) {
  try {
    const { code } = req.body;
    const sessionId = typeof req.cookies?.[SESSION_COOKIE_NAME] === "string"
      ? req.cookies[SESSION_COOKIE_NAME]
      : undefined;
    if (!sessionId || !code) {
      res.status(400).json({ error: "Session ID and code required" });
      return;
    }
    const result = await auth.verifyMfa(sessionId, code);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(400).json({ error: message });
  }
}

// Returns the caller's own profile with roles and permissions.
export async function profileHandler(req: Request, res: Response) {
  try {
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const result = await auth.getProfile(userId);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(404).json({ error: message });
  }
}

// Always your own sessions — same self-service class as GET /auth/profile, no permission grant.
export async function listSessionsHandler(req: Request, res: Response) {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const currentSessionId = typeof req.cookies?.[SESSION_COOKIE_NAME] === "string"
      ? req.cookies[SESSION_COOKIE_NAME]
      : undefined;
    const rows = await sessionRepo.findActiveByUser(userId);
    res.json({
      sessions: rows.map((row) => ({
        id: row.id,
        device: row.device,
        ip: row.ip,
        createdAt: row.createdAt,
        isCurrent: row.id === currentSessionId,
      })),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Revokes one of the caller's own sessions.
export async function revokeSessionHandler(req: Request, res: Response) {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const targetId = String(req.params.id);
    const row = await sessionRepo.findById(targetId);
    if (!row || row.userId !== userId) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const currentSessionId = typeof req.cookies?.[SESSION_COOKIE_NAME] === "string"
      ? req.cookies[SESSION_COOKIE_NAME]
      : undefined;
    if (row.id === currentSessionId) {
      res.status(400).json({ error: "Use logout to end your current session" });
      return;
    }
    await sessionRepo.revoke(targetId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}
