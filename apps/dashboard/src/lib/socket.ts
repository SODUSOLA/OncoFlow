import { io, type Socket } from "socket.io-client";

// Same reasoning as apps/web/lib/socket.ts — a WebSocket connection can't go through Vite's
// dev proxy the way REST fetches do, so this connects directly to the backend. Cookies aren't
// port-scoped, so the session cookie still gets sent with withCredentials on.
const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:3000";

let socket: Socket | null = null;

export function getSocket(): Socket {
  socket ??= io(API_ORIGIN, { withCredentials: true, autoConnect: true });
  return socket;
}
