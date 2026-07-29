import type { Request, Response } from "express";
import { AuthService } from "./service.js";
import { SESSION_COOKIE_NAME, getSessionCookieOptions } from "../../lib/session-cookie.js";

const auth = new AuthService();

export async function registerHandler(req: Request, res: Response) {
  try {
    const { email, password, device } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }
    const user = await auth.register(email, password, device ?? "unknown", req.ip ?? "unknown");
    res.status(201).json({ user: user.toSafeJSON() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message === "Email already registered" ? 409 : 400;
    res.status(status).json({ error: message });
  }
}

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
      mfaVerified: result.mfaVerified,
      userId: result.userId,
      roles: result.roles,
      user: result.user,
    });
  } catch (err) {
    res.status(401).json({ error: "Invalid email or password" });
  }
}

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
    res.clearCookie(SESSION_COOKIE_NAME, getSessionCookieOptions());
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

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
