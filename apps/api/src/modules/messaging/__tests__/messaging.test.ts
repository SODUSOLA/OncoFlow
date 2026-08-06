import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { MessagingService } from "../service.js";
import { MessagingJobService } from "../services/MessagingJobService.js";
import { ConversationRepository, MessageRepository } from "../repository.js";
import { db } from "../../../db/index.js";
import { patient } from "../../patient/schema.js";
import { facility } from "../../facility/schema.js";
import { user } from "../../auth/schema.js";

const messagingSvc = new MessagingService();
const jobSvc = new MessagingJobService();
const conversationRepo = new ConversationRepository();
const messageRepo = new MessageRepository();

let testPatientId: string;
let testPatientUserId: string;
let testStaffId: string;

beforeAll(async () => {
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Messaging Test Facility", region: "Lagos", address: "M St", status: "ACTIVE",
  }).returning();
  const facId = facRows[0]!.id;

  const patientUserRows = await db.insert(user).values({
    id: crypto.randomUUID(), email: "msg-patient-" + crypto.randomUUID().slice(0, 4) + "@test.com", passwordHash: "test",
  }).returning();
  testPatientUserId = patientUserRows[0]!.id;

  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "MSG-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    userId: testPatientUserId,
    firstName: "Msg", lastName: "Test", dob: "1990-01-01", gender: "Female",
    phone: "+2348011119999", email: "msg." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: facId, status: "ACTIVE",
  }).returning();
  testPatientId = patRows[0]!.id;

  const staffRows = await db.insert(user).values({
    id: crypto.randomUUID(), email: "msg-staff-" + crypto.randomUUID().slice(0, 4) + "@test.com", passwordHash: "test",
  }).returning();
  testStaffId = staffRows[0]!.id;
});

describe("MessagingService — SLA deadlines by conversation type", () => {
  // createdAt is stamped by Postgres's own defaultNow(), slaDeadline is computed from a
  // separate new Date() in the app a moment earlier — comparing their difference for exact
  // millisecond equality is inherently flaky; assert within a generous tolerance instead.
  it("gives ADMIN_INQUIRY a 5-minute SLA", async () => {
    const convo = await messagingSvc.startConversation({ patientId: testPatientId, conversationType: "ADMIN_INQUIRY" }, testPatientUserId);
    const row = await conversationRepo.findById(convo.id);
    const deadlineMs = new Date(row!.slaDeadline!).getTime() - new Date(row!.createdAt).getTime();
    expect(Math.abs(deadlineMs - 5 * 60 * 1000)).toBeLessThan(1000);
  });

  it("gives MO_SIDE_EFFECT a 2-minute SLA", async () => {
    // Self-service MO_SIDE_EFFECT now goes through the paid startSideEffectReport path
    // (side-effect-report.test.ts) — this test is purely about the SLA window computed for
    // the conversation type, so it uses the staff/free path (TEST_USER_ID bypass) to reach it.
    const convo = await messagingSvc.startConversation(
      { patientId: testPatientId, conversationType: "MO_SIDE_EFFECT" }, process.env.TEST_USER_ID!,
    );
    const row = await conversationRepo.findById(convo.id);
    const deadlineMs = new Date(row!.slaDeadline!).getTime() - new Date(row!.createdAt).getTime();
    expect(Math.abs(deadlineMs - 2 * 60 * 1000)).toBeLessThan(1000);
  });
});

describe("MessagingService — first_response_at (F3.1 DoD)", () => {
  it("does not stamp first_response_at for a SYSTEM message", async () => {
    const convo = await messagingSvc.startConversation({ patientId: testPatientId, conversationType: "ADMIN_INQUIRY" }, testPatientUserId);
    // SUPER_ADMIN as caller (bypasses ownership/permission) — this test is about the SYSTEM
    // message type's stamping behavior, not about who's authorized to post as staff.
    await messagingSvc.postMessage({
      conversationId: convo.id, senderId: testStaffId, type: "SYSTEM", content: "We'll respond within 5 minutes.",
    }, process.env.TEST_USER_ID!);
    const after = await messagingSvc.getConversation(convo.id, testPatientUserId);
    expect(after.firstResponseAt).toBeNull();
  });

  it("stamps first_response_at on the first real message, not on later ones", async () => {
    const convo = await messagingSvc.startConversation({ patientId: testPatientId, conversationType: "ADMIN_INQUIRY" }, testPatientUserId);
    await messagingSvc.postMessage({ conversationId: convo.id, senderId: testPatientUserId, type: "TEXT", content: "Hello" }, testPatientUserId);
    const first = await messagingSvc.getConversation(convo.id, testPatientUserId);
    expect(first.firstResponseAt).not.toBeNull();

    const firstStamp = first.firstResponseAt;
    await new Promise((r) => setTimeout(r, 10));
    await messagingSvc.postMessage({
      conversationId: convo.id, senderId: testStaffId, type: "TEXT", content: "Reply",
    }, process.env.TEST_USER_ID!);
    const second = await messagingSvc.getConversation(convo.id, testPatientUserId);
    expect(second.firstResponseAt).toBe(firstStamp);
  });
});

describe("MessagingJobService — SLA breach sweep (F3.1 DoD)", () => {
  it("flips sla_breached for an open, unanswered conversation past its deadline", async () => {
    const row = await conversationRepo.create({
      id: crypto.randomUUID(),
      patientId: testPatientId,
      conversationType: "MO_SIDE_EFFECT",
      status: "OPEN",
      slaDeadline: new Date(Date.now() - 1000), // already overdue, simulated — no real wait
    });

    const results = await jobSvc.sweepSlaBreaches();
    expect(results.some((r) => r.id === row.id && r.breached)).toBe(true);

    const after = await conversationRepo.findById(row.id);
    expect(after!.slaBreached).toBe(true);
  });

  it("does not flip a conversation that already has a first response", async () => {
    const row = await conversationRepo.create({
      id: crypto.randomUUID(),
      patientId: testPatientId,
      conversationType: "MO_SIDE_EFFECT",
      status: "OPEN",
      slaDeadline: new Date(Date.now() - 1000),
      firstResponseAt: new Date(),
    });

    await jobSvc.sweepSlaBreaches();
    const after = await conversationRepo.findById(row.id);
    expect(after!.slaBreached).toBe(false);
  });

  it("does not flip a conversation whose deadline hasn't passed yet", async () => {
    const row = await conversationRepo.create({
      id: crypto.randomUUID(),
      patientId: testPatientId,
      conversationType: "ADMIN_INQUIRY",
      status: "OPEN",
      slaDeadline: new Date(Date.now() + 10 * 60 * 1000),
    });

    await jobSvc.sweepSlaBreaches();
    const after = await conversationRepo.findById(row.id);
    expect(after!.slaBreached).toBe(false);
  });
});

describe("MessagingService — WhatsApp-style delivery/read status", () => {
  it("marks a staff message DELIVERED when the patient fetches their conversation list", async () => {
    const convo = await messagingSvc.startConversation({ patientId: testPatientId, conversationType: "ADMIN_INQUIRY" }, testPatientUserId);
    const posted = await messagingSvc.postMessage({
      conversationId: convo.id, senderId: testStaffId, type: "TEXT", content: "We're looking into it.",
    }, process.env.TEST_USER_ID!);
    expect(posted.status).toBe("SENT");

    await messagingSvc.listByPatient(testPatientId, testPatientUserId);

    const rows = await messageRepo.findByConversation(convo.id);
    const staffMessage = rows.find((r) => r.id === posted.id);
    expect(staffMessage!.status).toBe("DELIVERED");
  });

  it("does not mark the viewer's own messages as delivered", async () => {
    const convo = await messagingSvc.startConversation({ patientId: testPatientId, conversationType: "ADMIN_INQUIRY" }, testPatientUserId);
    const posted = await messagingSvc.postMessage(
      { conversationId: convo.id, senderId: testPatientUserId, type: "TEXT", content: "Hello" }, testPatientUserId,
    );

    await messagingSvc.listByPatient(testPatientId, testPatientUserId);

    const rows = await messageRepo.findByConversation(convo.id);
    const ownMessage = rows.find((r) => r.id === posted.id);
    expect(ownMessage!.status).toBe("SENT");
  });

  it("marks a patient's message READ when staff opens the thread", async () => {
    const convo = await messagingSvc.startConversation({ patientId: testPatientId, conversationType: "ADMIN_INQUIRY" }, testPatientUserId);
    const posted = await messagingSvc.postMessage(
      { conversationId: convo.id, senderId: testPatientUserId, type: "TEXT", content: "Any update?" }, testPatientUserId,
    );
    expect(posted.status).toBe("SENT");

    await messagingSvc.listMessages(convo.id, process.env.TEST_USER_ID!);

    const rows = await messageRepo.findByConversation(convo.id);
    const patientMessage = rows.find((r) => r.id === posted.id);
    expect(patientMessage!.status).toBe("READ");
  });

  it("marks a staff message READ when the patient opens the thread, even if never fetched as a list first", async () => {
    const convo = await messagingSvc.startConversation({ patientId: testPatientId, conversationType: "ADMIN_INQUIRY" }, testPatientUserId);
    const posted = await messagingSvc.postMessage({
      conversationId: convo.id, senderId: testStaffId, type: "TEXT", content: "Reply",
    }, process.env.TEST_USER_ID!);

    await messagingSvc.listMessages(convo.id, testPatientUserId);

    const rows = await messageRepo.findByConversation(convo.id);
    const staffMessage = rows.find((r) => r.id === posted.id);
    expect(staffMessage!.status).toBe("READ");
  });
});
