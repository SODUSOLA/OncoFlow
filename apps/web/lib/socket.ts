import { io, type Socket } from "socket.io-client";

// NEXT_PUBLIC_API_ORIGIN unset keeps the local default (straight to the backend). Set it to a URL to connect there, or to
// "same-origin" in a deployment so the socket rides this site's own /socket.io rewrite and carries the session cookie.
const configured = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:3000";
const API_ORIGIN = configured === "same-origin" ? undefined : configured;

let socket: Socket | null = null;

// Returns the shared Socket.IO client, creating it on first use.
export function getSocket(): Socket {
  socket ??= API_ORIGIN
    ? io(API_ORIGIN, { withCredentials: true, autoConnect: true })
    : io({ withCredentials: true, autoConnect: true });
  return socket;
}
