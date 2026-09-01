import { io, type Socket } from "socket.io-client";

// Unlike REST calls (proxied same-origin through /api, see next.config.ts's rewrites()), a
// WebSocket upgrade can't go through Next's rewrites — this connects directly to the backend.
// Cookies aren't port-scoped (only host + path), so the session cookie set via the proxied
// /api/auth/login response is still sent here automatically as long as withCredentials is on
// and the backend's CORS allowlist (CORS_ORIGIN) includes this app's origin.
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:3000";

let socket: Socket | null = null;

export function getSocket(): Socket {
  socket ??= io(API_ORIGIN, { withCredentials: true, autoConnect: true });
  return socket;
}
