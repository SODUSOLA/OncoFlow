import { config } from "../config.js";

export const SESSION_COOKIE_NAME = "oncoflow_session";

export function getSessionCookieOptions(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeMs,
  };
}

