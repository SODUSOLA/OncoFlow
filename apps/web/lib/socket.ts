import { io, type Socket } from "socket.io-client";

// Connects straight to the backend since WebSockets can't use Next's rewrites; the session cookie is sent because cookies aren't port-scoped.
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:3000";

let socket: Socket | null = null;

// Returns the shared Socket.IO client, creating it on first use.
export function getSocket(): Socket {
  socket ??= io(API_ORIGIN, { withCredentials: true, autoConnect: true });
  return socket;
}
