import { io, type Socket } from "socket.io-client";

// Same-origin by default (Vite proxies /socket.io to the API in dev, and a production reverse proxy should do the same),
// so no CORS allow-list entry is needed and the session cookie goes along. VITE_API_ORIGIN overrides for split hosting.
const API_ORIGIN: string | undefined = import.meta.env.VITE_API_ORIGIN || undefined;

let socket: Socket | null = null;

// Returns the shared Socket.IO client, creating it on first use.
export function getSocket(): Socket {
  socket ??= API_ORIGIN ? io(API_ORIGIN, { withCredentials: true, autoConnect: true }) : io({ withCredentials: true, autoConnect: true });
  return socket;
}
