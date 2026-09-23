import { config } from "../config.js";

export const SESSION_COOKIE_NAME = "oncoflow_session";

// Cookie options for the session cookie (httpOnly, sameSite, secure in production) with a 7-day default lifetime.
export function getSessionCookieOptions(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeMs,
  };
}

// Same attributes as the cookie was set with, minus maxAge — res.clearCookie sets its own immediate expiry,
// and passing maxAge to it is deprecated (and ignored) in Express 5.
export function getClearSessionCookieOptions() {
  const { httpOnly, secure, sameSite, path } = getSessionCookieOptions();
  return { httpOnly, secure, sameSite, path };
}

