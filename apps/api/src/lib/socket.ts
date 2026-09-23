import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { parseCookie } from "cookie";
import { config } from "../config.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { userHasPermission } from "./rbac.js";
// Imported from repository.js rather than each index.js to avoid a circular import through messaging/service.ts, which imports this file.
import { SessionRepository } from "../modules/auth/repository.js";
import { ConversationRepository } from "../modules/messaging/repository.js";
import { PatientRepository } from "../modules/patient/repository.js";

const sessionRepo = new SessionRepository();
const conversationRepo = new ConversationRepository();
const patientRepo = new PatientRepository();

// Validates the session cookie for the Socket.IO handshake, which bypasses cookie-parser; exported so it can be unit-tested.
export async function resolveSocketUser(cookieHeader: string | undefined): Promise<string | null> {
  if (!cookieHeader) return null;
  const cookies = parseCookie(cookieHeader);
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (!sessionId) return null;

  const session = await sessionRepo.findById(sessionId);
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  return session.userId;
}

// Ownership-or-permission check mirroring the HTTP rule for reading a conversation.
async function callerCanReadConversation(callerId: string, conversationId: string): Promise<boolean> {
  const row = await conversationRepo.findById(conversationId);
  if (!row) return false;
  const patientRow = await patientRepo.findById(row.patientId);
  const isSelf = !!patientRow?.userId && patientRow.userId === callerId;
  return isSelf || userHasPermission(callerId, "message", "read");
}

let io: Server | null = null;

// Attaches the Socket.IO server to the HTTP server and authenticates each handshake by session cookie.
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
    // Auto-joins a per-user room so notifications can reach a person without any client action.
    socket.join(`user:${socket.data.userId}`);

    // Explicit per-thread join that re-applies the HTTP ownership-or-permission rule so sockets can't read what REST would 403.
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

// Lazy accessor for services that emit; throws if called before attachSocketServer since that's a wiring bug.
export function getIo(): Server {
  if (!io) throw new Error("Socket.IO server not attached yet — call attachSocketServer(server) first");
  return io;
}

// True once the Socket.IO server has been attached.
export function isIoAttached(): boolean {
  return io !== null;
}
