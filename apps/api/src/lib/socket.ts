import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { parseCookie } from "cookie";
import { config } from "../config.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { userHasPermission } from "./rbac.js";
// All three imported directly from repository.js, not the module's own index.js — each
// index.js re-exports its module's service.ts, and messaging/service.ts (at least) imports
// this file back (for the message:new emit) — going through index.js here would make that a
// circular import evaluated at module-load time instead of a one-way dependency.
import { SessionRepository } from "../modules/auth/repository.js";
import { ConversationRepository } from "../modules/messaging/repository.js";
import { PatientRepository } from "../modules/patient/repository.js";

const sessionRepo = new SessionRepository();
const conversationRepo = new ConversationRepository();
const patientRepo = new PatientRepository();

// Same session-cookie validity check as attachRequestContext (lib/request-context.ts) for the
// HTTP path — Socket.IO doesn't run Express's cookie-parser middleware, so the handshake's raw
// cookie header has to be parsed and checked by hand here. Exported standalone so it can be
// unit-tested the same way request-context.test.ts tests the HTTP cookie path.
export async function resolveSocketUser(cookieHeader: string | undefined): Promise<string | null> {
  if (!cookieHeader) return null;
  const cookies = parseCookie(cookieHeader);
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (!sessionId) return null;

  const session = await sessionRepo.findById(sessionId);
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  return session.userId;
}

async function callerCanReadConversation(callerId: string, conversationId: string): Promise<boolean> {
  const row = await conversationRepo.findById(conversationId);
  if (!row) return false;
  const patientRow = await patientRepo.findById(row.patientId);
  const isSelf = !!patientRow?.userId && patientRow.userId === callerId;
  return isSelf || userHasPermission(callerId, "message", "read");
}

let io: Server | null = null;

export function attachSocketServer(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: config.corsOrigins, credentials: true },
  });

  io.use(async (socket, next) => {
    const userId = await resolveSocketUser(socket.handshake.headers.cookie);
    if (!userId) {
      next(new Error("Unauthorized"));
      return;
    }
    socket.data.userId = userId;
    next();
  });

  io.on("connection", (socket: Socket) => {
    // Per-user room, auto-joined — this is how a notification finds a specific person without
    // the client having to do anything beyond connecting.
    socket.join(`user:${socket.data.userId}`);

    // Explicit per-thread opt-in, not auto-join-all — re-checks the exact same ownership-or-
    // permission rule MessagingService.listMessages enforces over HTTP, so a socket connection
    // can't read a conversation the REST API itself would 403 on.
    socket.on("conversation:join", async (conversationId: unknown, ack?: (ok: boolean) => void) => {
      if (typeof conversationId !== "string") {
        ack?.(false);
        return;
      }
      const allowed = await callerCanReadConversation(socket.data.userId as string, conversationId);
      if (allowed) {
        socket.join(`conversation:${conversationId}`);
      }
      ack?.(allowed);
    });

    socket.on("conversation:leave", (conversationId: unknown) => {
      if (typeof conversationId === "string") {
        socket.leave(`conversation:${conversationId}`);
      }
    });
  });

  return io;
}

// Lazy accessor for the other services (MessagingService.postMessage, NotificationService.create)
// that need to emit — same shape as lib/redis.ts's getRedis() singleton. Throws instead of
// silently no-op-ing if called before attachSocketServer (a real wiring bug, not a "not
// configured yet" case like the third-party vendors elsewhere in this codebase).
export function getIo(): Server {
  if (!io) throw new Error("Socket.IO server not attached yet — call attachSocketServer(server) first");
  return io;
}

export function isIoAttached(): boolean {
  return io !== null;
}
