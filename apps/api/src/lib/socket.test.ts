import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import crypto from "node:crypto";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { db } from "../db/index.js";
import { user, session } from "../modules/auth/schema.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { resolveSocketUser, attachSocketServer, isIoAttached } from "./socket.js";
import { createApp } from "../app.js";
import { MessagingService } from "../modules/messaging/service.js";
import { notificationService } from "../modules/notification/index.js";
import { patient } from "../modules/patient/schema.js";
import { facility } from "../modules/facility/schema.js";

let userId: string;
let sessionId: string;

beforeAll(async () => {
  userId = crypto.randomUUID();
  await db.insert(user).values({ id: userId, email: `socket-${crypto.randomUUID()}@test.com`, passwordHash: "test" });
  sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
});

describe("resolveSocketUser", () => {
  it("resolves the userId for a valid session cookie", async () => {
    const result = await resolveSocketUser(`${SESSION_COOKIE_NAME}=${sessionId}`);
    expect(result).toBe(userId);
  });

  it("returns null with no cookie header at all", async () => {
    const result = await resolveSocketUser(undefined);
    expect(result).toBeNull();
  });

  it("returns null for an unknown session id", async () => {
    const result = await resolveSocketUser(`${SESSION_COOKIE_NAME}=${crypto.randomUUID()}`);
    expect(result).toBeNull();
  });

  it("returns null for a revoked session", async () => {
    const revokedId = crypto.randomUUID();
    await db.insert(session).values({
      id: revokedId, userId, device: "test", ip: "127.0.0.1",
      expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true, revokedAt: new Date(),
    });
    const result = await resolveSocketUser(`${SESSION_COOKIE_NAME}=${revokedId}`);
    expect(result).toBeNull();
  });

  it("returns null for an expired session", async () => {
    const expiredId = crypto.randomUUID();
    await db.insert(session).values({
      id: expiredId, userId, device: "test", ip: "127.0.0.1",
      expiresAt: new Date(Date.now() - 1000), mfaVerified: true,
    });
    const result = await resolveSocketUser(`${SESSION_COOKIE_NAME}=${expiredId}`);
    expect(result).toBeNull();
  });
});

describe("Socket.IO — real connection, emit on real events", () => {
  let httpServer: http.Server;
  let port: number;
  let clientSocket: ClientSocket;
  let testPatientId: string;
  let testPatientUserId: string;

  beforeAll(async () => {
    const app = createApp();
    httpServer = http.createServer(app);
    attachSocketServer(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as { port: number }).port;

    const facRows = await db.insert(facility).values({
      id: crypto.randomUUID(), name: "Socket Test Facility", region: "Lagos", address: "S St", status: "ACTIVE",
    }).returning();

    testPatientUserId = crypto.randomUUID();
    await db.insert(user).values({ id: testPatientUserId, email: `socket-pat-${crypto.randomUUID()}@test.com`, passwordHash: "test" });
    const patRows = await db.insert(patient).values({
      id: crypto.randomUUID(), uniquePatientId: "SOCK-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
      userId: testPatientUserId,
      firstName: "Socket", lastName: "Test", dob: "1990-01-01", gender: "Male",
      phone: "+2348011117777", email: "socket." + crypto.randomUUID().slice(0, 4) + "@test.com",
      facilityId: facRows[0]!.id, status: "ACTIVE",
    }).returning();
    testPatientId = patRows[0]!.id;
  });

  afterAll(async () => {
    clientSocket?.disconnect();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("rejects a connection with no valid session cookie", async () => {
    const badClient = ioClient(`http://localhost:${port}`, { transports: ["websocket"], reconnection: false });
    const err = await new Promise((resolve) => {
      badClient.on("connect_error", (e: Error) => resolve(e));
      badClient.on("connect", () => resolve(null));
    });
    expect(err).not.toBeNull();
    badClient.disconnect();
  });

  it("accepts a connection with a valid session cookie and joins the user's own room", async () => {
    clientSocket = ioClient(`http://localhost:${port}`, {
      transports: ["websocket"],
      reconnection: false,
      extraHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${sessionId}` },
    });
    await new Promise<void>((resolve, reject) => {
      clientSocket.on("connect", () => resolve());
      clientSocket.on("connect_error", reject);
    });
    expect(clientSocket.connected).toBe(true);
  });

  it("delivers notification:new to the user's own room in real time", async () => {
    expect(isIoAttached()).toBe(true);

    const received = new Promise((resolve) => {
      clientSocket.once("notification:new", resolve);
    });

    await notificationService.create({ recipientId: userId, type: "SLA_BREACH" });

    const payload = await received;
    expect(payload).toMatchObject({ recipientId: userId, type: "SLA_BREACH" });
  });

  it("delivers message:new only after explicitly joining the conversation room", async () => {
    const messagingSvc = new MessagingService();
    const convo = await messagingSvc.startConversation(
      { patientId: testPatientId, conversationType: "ADMIN_INQUIRY" }, testPatientUserId,
    );

    // Not joined yet — posting a message must not reach this client.
    let receivedTooEarly = false;
    clientSocket.once("message:new", () => { receivedTooEarly = true; });
    await messagingSvc.postMessage(
      { conversationId: convo.id, type: "TEXT", content: "before join" },
      testPatientUserId,
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(receivedTooEarly).toBe(false);

    // patientUserId owns this conversation's patient — but this socket is authenticated as a
    // DIFFERENT user (userId), so the join must be rejected (not a self-service caller, no grant).
    const joinedAsStranger = await new Promise((resolve) => {
      clientSocket.emit("conversation:join", convo.id, resolve);
    });
    expect(joinedAsStranger).toBe(false);

    // The conversation's own patient, joining as themselves, must succeed and then actually
    // receive the next message posted to that room.
    const patientSessionId = crypto.randomUUID();
    await db.insert(session).values({
      id: patientSessionId, userId: testPatientUserId, device: "test", ip: "127.0.0.1",
      expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
    });
    const patientClient = ioClient(`http://localhost:${port}`, {
      transports: ["websocket"],
      reconnection: false,
      extraHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${patientSessionId}` },
    });
    await new Promise<void>((resolve, reject) => {
      patientClient.on("connect", () => resolve());
      patientClient.on("connect_error", reject);
    });

    const joinedAsOwner = await new Promise((resolve) => {
      patientClient.emit("conversation:join", convo.id, resolve);
    });
    expect(joinedAsOwner).toBe(true);

    const messageReceived = new Promise((resolve) => {
      patientClient.once("message:new", resolve);
    });
    await messagingSvc.postMessage(
      { conversationId: convo.id, type: "TEXT", content: "after join" },
      testPatientUserId,
    );
    const payload = await messageReceived;
    expect(payload).toMatchObject({ conversationId: convo.id, content: "after join" });

    patientClient.disconnect();
  });
});
