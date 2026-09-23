import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { MeetingService } from "../service.js";
import { MeetingRepository, TranscriptRepository } from "../repository.js";
import { Transcript } from "../entities/Transcript.js";
import { createDailyRoom, verifyDailyWebhookSignature } from "../services/DailyService.js";
import { db } from "../../../db/index.js";
import { patient } from "../../patient/schema.js";
import { facility } from "../../facility/schema.js";
import { user } from "../../auth/schema.js";
import { appointment } from "../../appointment/schema.js";

const meetingSvc = new MeetingService();
const meetingRepo = new MeetingRepository();
const transcriptRepo = new TranscriptRepository();

let testAppointmentId: string;
let testAppointmentId2: string;
let testAppointmentId3: string;
let testPatientId: string;
let testFacilityId: string;

// Inserts an appointment and returns its id.
async function createTestAppointment(): Promise<string> {
  const rows = await db.insert(appointment).values({
    id: crypto.randomUUID(), patientId: testPatientId, facilityId: testFacilityId,
    appointmentType: "VIRTUAL", scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
  }).returning();
  return rows[0]!.id;
}

beforeAll(async () => {
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Video Test Facility", region: "Lagos", address: "V St", status: "ACTIVE",
  }).returning();
  const facId = facRows[0]!.id;

  const patientUserRows = await db.insert(user).values({
    id: crypto.randomUUID(), email: "video-patient-" + crypto.randomUUID().slice(0, 4) + "@test.com", passwordHash: "test",
  }).returning();

  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "VID-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    userId: patientUserRows[0]!.id,
    firstName: "Vid", lastName: "Test", dob: "1990-01-01", gender: "Female",
    phone: "+2348011118888", email: "vid." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: facId, status: "ACTIVE",
  }).returning();
  testPatientId = patRows[0]!.id;
  testFacilityId = facId;

  const apptRows = await db.insert(appointment).values({
    id: crypto.randomUUID(), patientId: patRows[0]!.id, facilityId: facId,
    appointmentType: "VIRTUAL", scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
  }).returning();
  testAppointmentId = apptRows[0]!.id;

  const apptRows2 = await db.insert(appointment).values({
    id: crypto.randomUUID(), patientId: patRows[0]!.id, facilityId: facId,
    appointmentType: "VIRTUAL", scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  }).returning();
  testAppointmentId2 = apptRows2[0]!.id;

  const apptRows3 = await db.insert(appointment).values({
    id: crypto.randomUUID(), patientId: patRows[0]!.id, facilityId: facId,
    appointmentType: "VIRTUAL", scheduledAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
  }).returning();
  testAppointmentId3 = apptRows3[0]!.id;
});

describe("DailyService — not configured without credentials (F3.7, R2/Monnify precedent)", () => {
  it("createDailyRoom throws a clear error when DAILY_API_KEY is unset", async () => {
    await expect(createDailyRoom("room-" + crypto.randomUUID())).rejects.toThrow(/DAILY_API_KEY/);
  });

  it("verifyDailyWebhookSignature throws a clear error when DAILY_WEBHOOK_SECRET is unset", () => {
    expect(() => verifyDailyWebhookSignature("{}", "123", "sig")).toThrow(/DAILY_WEBHOOK_SECRET/);
  });
});

describe("verifyDailyWebhookSignature — pure HMAC verification", () => {
  const secret = "test-webhook-secret";

  beforeAll(() => {
    process.env.DAILY_WEBHOOK_SECRET = secret;
  });

  it("accepts a self-computed valid signature", () => {
    const rawBody = JSON.stringify({ event: "meeting.ended" });
    const timestamp = "1700000000";
    const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("base64");
    expect(verifyDailyWebhookSignature(rawBody, timestamp, signature)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const timestamp = "1700000000";
    const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${JSON.stringify({ event: "meeting.ended" })}`).digest("base64");
    const tamperedBody = JSON.stringify({ event: "meeting.started" });
    expect(verifyDailyWebhookSignature(tamperedBody, timestamp, signature)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const rawBody = JSON.stringify({ event: "meeting.ended" });
    const timestamp = "1700000000";
    expect(verifyDailyWebhookSignature(rawBody, timestamp, "not-a-real-signature")).toBe(false);
  });
});

describe("MeetingRepository / TranscriptRepository — CRUD", () => {
  it("creates and finds a meeting by appointment, id, and room id", async () => {
    const row = await meetingRepo.create({
      id: crypto.randomUUID(), appointmentId: testAppointmentId,
      provider: "daily.co", roomId: "room-" + crypto.randomUUID(), status: "SCHEDULED",
    });
    expect((await meetingRepo.findById(row.id))!.id).toBe(row.id);
    expect((await meetingRepo.findByAppointment(testAppointmentId))!.id).toBe(row.id);
    expect((await meetingRepo.findByRoomId(row.roomId))!.id).toBe(row.id);
  });

  it("enforces at most one meeting per appointment (UNIQUE appointment_id)", async () => {
    await meetingRepo.create({
      id: crypto.randomUUID(), appointmentId: testAppointmentId2,
      provider: "daily.co", roomId: "room-" + crypto.randomUUID(), status: "SCHEDULED",
    });
    await expect(meetingRepo.create({
      id: crypto.randomUUID(), appointmentId: testAppointmentId2,
      provider: "daily.co", roomId: "room-" + crypto.randomUUID(), status: "SCHEDULED",
    })).rejects.toThrow();
  });

  it("creates and lists transcript entries for a meeting, ordered by createdAt", async () => {
    const meetingRow = await meetingRepo.create({
      id: crypto.randomUUID(), appointmentId: testAppointmentId3,
      provider: "daily.co", roomId: "room-" + crypto.randomUUID(), status: "SCHEDULED",
    });

    await transcriptRepo.create({ id: crypto.randomUUID(), meetingId: meetingRow.id, speaker: "Dr. A", content: "Hello" });
    await new Promise((r) => setTimeout(r, 10));
    await transcriptRepo.create({ id: crypto.randomUUID(), meetingId: meetingRow.id, speaker: "Patient", content: "Hi doctor" });

    const rows = await transcriptRepo.findByMeeting(meetingRow.id);
    expect(rows.length).toBe(2);
    expect(rows[0]!.content).toBe("Hello");
    expect(rows[1]!.content).toBe("Hi doctor");
  });
});

describe("Transcript.edit — post-hoc correction (F3.7, the deliberate non-append-only case)", () => {
  it("returns a new Transcript with updated content, editedBy, and editedAt", () => {
    const original = new Transcript({
      id: crypto.randomUUID(), meetingId: crypto.randomUUID(),
      speaker: "Dr. A", content: "The patient reports mild nausea",
      editedBy: null, editedAt: null, createdAt: new Date(),
    });
    const editorId = crypto.randomUUID();
    const edited = original.edit("The patient reports moderate nausea", editorId);

    expect(edited.content).toBe("The patient reports moderate nausea");
    expect(edited.editedBy).toBe(editorId);
    expect(edited.editedAt).toBeInstanceOf(Date);
    expect(original.content).toBe("The patient reports mild nausea");
  });
});

describe("MeetingService.syncStatus — SCHEDULED → IN_PROGRESS → ENDED transition guard", () => {
  it("allows SCHEDULED → IN_PROGRESS → ENDED in order", async () => {
    const roomId = "room-" + crypto.randomUUID();
    await meetingRepo.create({
      id: crypto.randomUUID(), appointmentId: await createTestAppointment(), provider: "daily.co", roomId, status: "SCHEDULED",
    });
    const inProgress = await meetingSvc.syncStatus(roomId, "IN_PROGRESS");
    expect(inProgress.status).toBe("IN_PROGRESS");
    const ended = await meetingSvc.syncStatus(roomId, "ENDED");
    expect(ended.status).toBe("ENDED");
  });

  it("rejects skipping straight from SCHEDULED to a status not reachable, and rejects transitions out of ENDED", async () => {
    const roomId = "room-" + crypto.randomUUID();
    await meetingRepo.create({
      id: crypto.randomUUID(), appointmentId: await createTestAppointment(), provider: "daily.co", roomId, status: "ENDED",
    });
    await expect(meetingSvc.syncStatus(roomId, "IN_PROGRESS")).rejects.toThrow(/Cannot transition/);
  });

  it("throws Meeting not found for an unknown room id", async () => {
    await expect(meetingSvc.syncStatus("unknown-room-" + crypto.randomUUID(), "IN_PROGRESS")).rejects.toThrow("Meeting not found for this room");
  });
});
