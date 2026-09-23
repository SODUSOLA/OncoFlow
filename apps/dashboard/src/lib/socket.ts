import { io, type Socket } from "socket.io-client";

// Connects straight to the backend because WebSockets can't use Vite's dev proxy; the session cookie is sent since cookies aren't port-scoped.
const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:3000";

let socket: Socket | null = null;

// Returns the shared Socket.IO client, creating it on first use.
export function getSocket(): Socket {
  socket ??= io(API_ORIGIN, { withCredentials: true, autoConnect: true });
  return socket;
}
