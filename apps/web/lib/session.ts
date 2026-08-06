import "server-only";
import { cookies } from "next/headers";

// Same cookie apps/api sets on login (apps/api/src/lib/session-cookie.ts) — reading it directly
// here (rather than through the browser-only /api rewrite in next.config.ts) is what lets Server
// Components check auth before anything renders, no client-side loading flash.
const SESSION_COOKIE_NAME = "oncoflow_session";
const API_ORIGIN = process.env.API_PROXY_TARGET ?? "http://localhost:3000";

export interface SessionUser {
  id: string;
  email: string;
  status: string;
  facilityId: string | null;
}

export interface SessionRole {
  id: string;
  roleId: string;
  roleName: string;
  roleDescription: string;
}

export interface Session {
  user: SessionUser;
  roles: SessionRole[];
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!sessionCookie) return null;

  const res = await fetch(`${API_ORIGIN}/auth/profile`, {
    headers: { Cookie: `${SESSION_COOKIE_NAME}=${sessionCookie.value}` },
    cache: "no-store",
  });
  if (!res.ok) return null;

  return res.json();
}
