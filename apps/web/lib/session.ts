import "server-only";
import { cookies } from "next/headers";

// Reads the same session cookie the API sets, so Server Components can check auth before rendering without a loading flash.
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

// Returns the current session from the cookie, or null.
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
