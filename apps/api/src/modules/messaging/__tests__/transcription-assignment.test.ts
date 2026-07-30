import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { TranscriptionAssignmentService, MeetingService } from "../service.js";
import { MessagingJobService } from "../services/MessagingJobService.js";
import { TranscriptionAssignmentRepository, MeetingRepository } from "../repository.js";
import { TranscriptionAssignment } from "../entities/TranscriptionAssignment.js";
import { Meeting } from "../entities/Meeting.js";
import { db } from "../../../db/index.js";
import { patient } from "../../patient/schema.js";
import { facility } from "../../facility/schema.js";
import { user } from "../../auth/schema.js";
import { appointment } from "../../appointment/schema.js";
import type { meetingStatusEnum } from "../../../db/enums.js";

type MeetingStatus = (typeof meetingStatusEnum.enumValues)[number];

const transcriptionSvc = new TranscriptionAssignmentService();
const meetingSvc = new MeetingService();
const jobSvc = new MessagingJobService();
const transcriptionRepo = new TranscriptionAssignmentRepository();
const meetingRepo = new MeetingRepository();

let testPatientId: string;
let testFacilityId: string;

async function createMeeting(status: MeetingStatus = "SCHEDULED", oncologistId: string | null = null) {
  const apptRows = await db.insert(appointment).values({
    id: crypto.randomUUID(), patientId: testPatientId, facilityId: testFacilityId,
    oncologistId, appointmentType: "VIRTUAL", scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
  }).returning();
  return meetingRepo.create({
    id: crypto.randomUUID(), appointmentId: apptRows[0]!.id,
    provider: "daily.co", roomId: "room-" + crypto.randomUUID(), status,
  });
}

// Fresh scribe per call, deliberately — the backlog cap (5 concurrent CLAIMED/IN_PROGRESS)
// is a real per-scribe limit, so tests sharing one scribe fixture across many claims would
// pollute each other's counts. Each test that claims something gets its own scribe.
async function createScribe() {
  const rows = await db.insert(user).values({
    id: crypto.randomUUID(), email: "scribe-" + crypto.randomUUID().slice(0, 8) + "@test.com", passwordHash: "test",
  }).returning();
  return rows[0]!.id;
}

beforeAll(async () => {
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Scribe Test Facility", region: "Lagos", address: "S St", status: "ACTIVE",
  }).returning();
  testFacilityId = facRows[0]!.id;

  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "SCR-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    firstName: "Scribe", lastName: "Test", dob: "1990-01-01", gender: "Female",
    phone: "+2348011117777", email: "scribe." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: testFacilityId, status: "ACTIVE",
  }).returning();
  testPatientId = patRows[0]!.id;
});

describe("TranscriptionAssignment entity — state machine (F3.11)", () => {
  const base = {
    id: crypto.randomUUID(), meetingId: crypto.randomUUID(), scribeId: null,
    status: "QUEUED" as const, queuedAt: new Date(), claimedAt: null, completedAt: null,
    slaDeadline: new Date(Date.now() + 1000), slaBreached: false,
  };

  it("computes a 24-hour SLA deadline from the given queuedAt", () => {
    const now = new Date();
    const deadline = TranscriptionAssignment.slaDeadlineFor(now);
    expect(deadline.getTime() - now.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("claim() moves QUEUED -> CLAIMED and sets scribeId/claimedAt", () => {
    const scribeId = crypto.randomUUID();
    const now = new Date();
    const claimed = new TranscriptionAssignment(base).claim(scribeId, now);
    expect(claimed.status).toBe("CLAIMED");
    expect(claimed.scribeId).toBe(scribeId);
    expect(claimed.claimedAt).toBe(now);
  });

  it("release() moves CLAIMED -> RELEASED and clears scribeId/claimedAt", () => {
    const claimed = new TranscriptionAssignment({ ...base, status: "CLAIMED", scribeId: crypto.randomUUID(), claimedAt: new Date() });
    const released = claimed.release();
    expect(released.status).toBe("RELEASED");
    expect(released.scribeId).toBeNull();
    expect(released.claimedAt).toBeNull();
  });

  it("a RELEASED assignment can be re-claimed — the queue, not a dead end", () => {
    const released = new TranscriptionAssignment({ ...base, status: "RELEASED" });
    const reClaimed = released.claim(crypto.randomUUID(), new Date());
    expect(reClaimed.status).toBe("CLAIMED");
  });

  it("complete() moves CLAIMED -> COMPLETED and sets completedAt", () => {
    const claimed = new TranscriptionAssignment({ ...base, status: "CLAIMED", scribeId: crypto.randomUUID(), claimedAt: new Date() });
    const now = new Date();
    const completed = claimed.complete(now);
    expect(completed.status).toBe("COMPLETED");
    expect(completed.completedAt).toBe(now);
  });

  it("rejects an illegal transition (QUEUED -> COMPLETED, skipping claim)", () => {
    expect(() => new TranscriptionAssignment(base).complete(new Date())).toThrow(/Cannot transition/);
  });

  it("rejects claiming an already-COMPLETED assignment", () => {
    const completed = new TranscriptionAssignment({ ...base, status: "COMPLETED", completedAt: new Date() });
    expect(() => completed.claim(crypto.randomUUID(), new Date())).toThrow(/Cannot transition/);
  });

  it("checkBreach flips slaBreached only when overdue and not completed", () => {
    const overdue = new TranscriptionAssignment({ ...base, slaDeadline: new Date(Date.now() - 1000) });
    expect(overdue.checkBreach(new Date()).slaBreached).toBe(true);

    const notOverdue = new TranscriptionAssignment({ ...base, slaDeadline: new Date(Date.now() + 1000) });
    expect(notOverdue.checkBreach(new Date()).slaBreached).toBe(false);

    const completedOverdue = new TranscriptionAssignment({
      ...base, status: "COMPLETED", slaDeadline: new Date(Date.now() - 1000), completedAt: new Date(),
    });
    expect(completedOverdue.checkBreach(new Date()).slaBreached).toBe(false);
  });
});

describe("Meeting transcript sign-off — two-stage entity guard (F3.11 §4, revised)", () => {
  const baseMeeting = {
    id: crypto.randomUUID(), appointmentId: crypto.randomUUID(), provider: "daily.co",
    roomId: "room-x", status: "ENDED" as const,
    transcriptCorrectedAt: null, transcriptCorrectedBy: null,
    transcriptSignedOffAt: null, transcriptSignedOffBy: null,
  };

  it("records a Scribe's transcript correction on an ENDED meeting", () => {
    const correctedBy = crypto.randomUUID();
    const now = new Date();
    const corrected = new Meeting(baseMeeting).recordTranscriptCorrection(correctedBy, now);
    expect(corrected.transcriptCorrectedBy).toBe(correctedBy);
    expect(corrected.transcriptCorrectedAt).toBe(now);
    expect(corrected.transcriptSignedOffAt).toBeNull();
  });

  it("rejects recording a correction for a meeting that hasn't ended", () => {
    const meeting = new Meeting({ ...baseMeeting, status: "SCHEDULED" });
    expect(() => meeting.recordTranscriptCorrection(crypto.randomUUID(), new Date())).toThrow(/hasn't ended/);
  });

  it("rejects recording a correction twice", () => {
    const meeting = new Meeting({ ...baseMeeting, transcriptCorrectedAt: new Date(), transcriptCorrectedBy: crypto.randomUUID() });
    expect(() => meeting.recordTranscriptCorrection(crypto.randomUUID(), new Date())).toThrow("Transcript correction already recorded");
  });

  it("signs off a corrected transcript (stage 2)", () => {
    const corrected = new Meeting({ ...baseMeeting, transcriptCorrectedAt: new Date(), transcriptCorrectedBy: crypto.randomUUID() });
    const signedOffBy = crypto.randomUUID();
    const now = new Date();
    const signedOff = corrected.signOffTranscript(signedOffBy, now);
    expect(signedOff.transcriptSignedOffBy).toBe(signedOffBy);
    expect(signedOff.transcriptSignedOffAt).toBe(now);
  });

  it("rejects signing off before the Scribe has recorded a correction — the hard sequencing rule", () => {
    const meeting = new Meeting(baseMeeting);
    expect(() => meeting.signOffTranscript(crypto.randomUUID(), new Date())).toThrow(/Cannot sign off/);
  });

  it("rejects signing off twice", () => {
    const meeting = new Meeting({
      ...baseMeeting,
      transcriptCorrectedAt: new Date(), transcriptCorrectedBy: crypto.randomUUID(),
      transcriptSignedOffAt: new Date(), transcriptSignedOffBy: crypto.randomUUID(),
    });
    expect(() => meeting.signOffTranscript(crypto.randomUUID(), new Date())).toThrow("Transcript already signed off");
  });
});

describe("TranscriptionAssignmentService.queueForMeeting (F3.11)", () => {
  it("queues an assignment with a ~24h SLA deadline from queuedAt", async () => {
    const meetingRow = await createMeeting("ENDED");
    const result = await transcriptionSvc.queueForMeeting(meetingRow.id);
    expect(result.status).toBe("QUEUED");
    const deadlineMs = new Date(result.slaDeadline!).getTime() - new Date(result.queuedAt).getTime();
    expect(Math.abs(deadlineMs - 24 * 60 * 60 * 1000)).toBeLessThan(1000);
  });
});

describe("MeetingService.syncStatus — auto-queues a transcription assignment on ENDED (F3.11)", () => {
  it("creates a QUEUED TranscriptionAssignment when a meeting transitions to ENDED", async () => {
    const meetingRow = await createMeeting("SCHEDULED");
    await meetingSvc.syncStatus(meetingRow.roomId, "ENDED");
    const assignment = await transcriptionRepo.findByMeeting(meetingRow.id);
    expect(assignment).not.toBeNull();
    expect(assignment!.status).toBe("QUEUED");
  });
});

describe("TranscriptionAssignmentService — claim & backlog cap (F3.11 §5)", () => {
  it("claims a QUEUED assignment for a scribe", async () => {
    const scribeId = await createScribe();
    const meetingRow = await createMeeting("ENDED");
    const queued = await transcriptionSvc.queueForMeeting(meetingRow.id);
    const claimed = await transcriptionSvc.claim(queued.id, scribeId);
    expect(claimed.status).toBe("CLAIMED");
    expect(claimed.scribeId).toBe(scribeId);
  });

  it("enforces the backlog cap of 5 concurrent claims per scribe", async () => {
    const backlogScribeId = await createScribe();

    for (let i = 0; i < 5; i++) {
      const meetingRow = await createMeeting("ENDED");
      const queued = await transcriptionSvc.queueForMeeting(meetingRow.id);
      await transcriptionSvc.claim(queued.id, backlogScribeId);
    }

    const sixthMeeting = await createMeeting("ENDED");
    const sixthQueued = await transcriptionSvc.queueForMeeting(sixthMeeting.id);
    await expect(transcriptionSvc.claim(sixthQueued.id, backlogScribeId)).rejects.toThrow(/Backlog cap reached/);
  });
});

describe("TranscriptionAssignmentService — release & finalize ownership (F3.11)", () => {
  it("releases own claim back to the pool", async () => {
    const scribeId = await createScribe();
    const meetingRow = await createMeeting("ENDED");
    const queued = await transcriptionSvc.queueForMeeting(meetingRow.id);
    const claimed = await transcriptionSvc.claim(queued.id, scribeId);
    const released = await transcriptionSvc.release(claimed.id, scribeId);
    expect(released.status).toBe("RELEASED");
    expect(released.scribeId).toBeNull();
  });

  it("rejects releasing another scribe's claim", async () => {
    const [scribeAId, scribeBId] = await Promise.all([createScribe(), createScribe()]);
    const meetingRow = await createMeeting("ENDED");
    const queued = await transcriptionSvc.queueForMeeting(meetingRow.id);
    const claimed = await transcriptionSvc.claim(queued.id, scribeAId);
    await expect(transcriptionSvc.release(claimed.id, scribeBId)).rejects.toThrow("You can only release your own claimed assignments");
  });

  it("finalize completes the assignment and records the Scribe's correction on Meeting — stage 1 only, not yet signed off (F3.11 §4, revised)", async () => {
    const scribeId = await createScribe();
    const meetingRow = await createMeeting("ENDED");
    const queued = await transcriptionSvc.queueForMeeting(meetingRow.id);
    const claimed = await transcriptionSvc.claim(queued.id, scribeId);
    const finalized = await transcriptionSvc.finalize(claimed.id, scribeId);
    expect(finalized.status).toBe("COMPLETED");

    const meetingAfter = await meetingRepo.findById(meetingRow.id);
    expect(meetingAfter!.transcriptCorrectedAt).not.toBeNull();
    expect(meetingAfter!.transcriptCorrectedBy).toBe(scribeId);
    expect(meetingAfter!.transcriptSignedOffAt).toBeNull();
  });

  it("rejects finalizing another scribe's claim", async () => {
    const [scribeAId, scribeBId] = await Promise.all([createScribe(), createScribe()]);
    const meetingRow = await createMeeting("ENDED");
    const queued = await transcriptionSvc.queueForMeeting(meetingRow.id);
    const claimed = await transcriptionSvc.claim(queued.id, scribeAId);
    await expect(transcriptionSvc.finalize(claimed.id, scribeBId)).rejects.toThrow("You can only finalize your own claimed assignments");
  });
});

describe("MeetingService.signOffTranscript — stage 2, the respective consultant (F3.11 §4, revised)", () => {
  it("lets the appointment's assigned oncologist sign off a corrected transcript", async () => {
    const scribeId = await createScribe();
    const oncologistId = await createScribe(); // any user id works as a fixture here
    const meetingRow = await createMeeting("ENDED", oncologistId);
    const queued = await transcriptionSvc.queueForMeeting(meetingRow.id);
    const claimed = await transcriptionSvc.claim(queued.id, scribeId);
    await transcriptionSvc.finalize(claimed.id, scribeId);

    const signedOff = await meetingSvc.signOffTranscript(meetingRow.id, oncologistId);
    expect(signedOff.transcriptSignedOffAt).not.toBeNull();
    expect(signedOff.transcriptSignedOffBy).toBe(oncologistId);
  });

  it("rejects sign-off from a consultant who isn't the appointment's assigned oncologist", async () => {
    const scribeId = await createScribe();
    const [oncologistId, otherConsultantId] = await Promise.all([createScribe(), createScribe()]);
    const meetingRow = await createMeeting("ENDED", oncologistId);
    const queued = await transcriptionSvc.queueForMeeting(meetingRow.id);
    const claimed = await transcriptionSvc.claim(queued.id, scribeId);
    await transcriptionSvc.finalize(claimed.id, scribeId);

    await expect(meetingSvc.signOffTranscript(meetingRow.id, otherConsultantId))
      .rejects.toThrow("Only the appointment's assigned consultant can sign off on this transcript");
  });

  it("rejects sign-off before the Scribe has recorded a correction — the hard sequencing rule, enforced end-to-end", async () => {
    const oncologistId = await createScribe();
    const meetingRow = await createMeeting("ENDED", oncologistId);
    await transcriptionSvc.queueForMeeting(meetingRow.id); // queued, but no Scribe correction yet

    await expect(meetingSvc.signOffTranscript(meetingRow.id, oncologistId))
      .rejects.toThrow(/Cannot sign off/);
  });

  it("lets SUPER_ADMIN sign off regardless of ownership (break-glass)", async () => {
    const scribeId = await createScribe();
    const oncologistId = await createScribe();
    const meetingRow = await createMeeting("ENDED", oncologistId);
    const queued = await transcriptionSvc.queueForMeeting(meetingRow.id);
    const claimed = await transcriptionSvc.claim(queued.id, scribeId);
    await transcriptionSvc.finalize(claimed.id, scribeId);

    const superAdminId = process.env.TEST_USER_ID!;
    const signedOff = await meetingSvc.signOffTranscript(meetingRow.id, superAdminId);
    expect(signedOff.transcriptSignedOffBy).toBe(superAdminId);
  });
});

describe("MessagingJobService.sweepTranscriptionSlaBreaches (F3.11 §5)", () => {
  it("flips slaBreached for an overdue, unresolved assignment regardless of claim status", async () => {
    const meetingRow = await createMeeting("ENDED");
    const row = await transcriptionRepo.create({
      id: crypto.randomUUID(), meetingId: meetingRow.id, status: "QUEUED",
      queuedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      slaDeadline: new Date(Date.now() - 1000),
    });

    const results = await jobSvc.sweepTranscriptionSlaBreaches();
    expect(results.some((r) => r.id === row.id && r.breached)).toBe(true);

    const after = await transcriptionRepo.findById(row.id);
    expect(after!.slaBreached).toBe(true);
  });

  it("does not flip an assignment that's already completed", async () => {
    const meetingRow = await createMeeting("ENDED");
    const row = await transcriptionRepo.create({
      id: crypto.randomUUID(), meetingId: meetingRow.id, status: "COMPLETED",
      queuedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      slaDeadline: new Date(Date.now() - 1000),
      completedAt: new Date(),
    });

    await jobSvc.sweepTranscriptionSlaBreaches();
    const after = await transcriptionRepo.findById(row.id);
    expect(after!.slaBreached).toBe(false);
  });
});

describe("MeetingService.editTranscriptEntry — own claims only (F3.11 hard rule)", () => {
  it("lets the scribe who claimed the meeting edit its transcript", async () => {
    const scribeId = await createScribe();
    const meetingRow = await createMeeting("ENDED");
    const queued = await transcriptionSvc.queueForMeeting(meetingRow.id);
    await transcriptionSvc.claim(queued.id, scribeId);
    const entry = await meetingSvc.appendTranscript(meetingRow.id, { speaker: "Dr. A", content: "mispelled term" });

    const edited = await meetingSvc.editTranscriptEntry(entry.id, "correctly spelled term", scribeId);
    expect(edited.content).toBe("correctly spelled term");
    expect(edited.editedBy).toBe(scribeId);
  });

  it("rejects an edit from a scribe who hasn't claimed this meeting", async () => {
    const [scribeAId, scribeBId] = await Promise.all([createScribe(), createScribe()]);
    const meetingRow = await createMeeting("ENDED");
    const queued = await transcriptionSvc.queueForMeeting(meetingRow.id);
    await transcriptionSvc.claim(queued.id, scribeAId);
    const entry = await meetingSvc.appendTranscript(meetingRow.id, { speaker: "Dr. A", content: "original" });

    await expect(meetingSvc.editTranscriptEntry(entry.id, "unauthorized edit", scribeBId))
      .rejects.toThrow("You can only edit transcripts for meetings you have claimed");
  });

  it("rejects an edit once the scribe has released their claim", async () => {
    const scribeId = await createScribe();
    const meetingRow = await createMeeting("ENDED");
    const queued = await transcriptionSvc.queueForMeeting(meetingRow.id);
    const claimed = await transcriptionSvc.claim(queued.id, scribeId);
    await transcriptionSvc.release(claimed.id, scribeId);
    const entry = await meetingSvc.appendTranscript(meetingRow.id, { speaker: "Dr. A", content: "original" });

    await expect(meetingSvc.editTranscriptEntry(entry.id, "edit after release", scribeId))
      .rejects.toThrow("You can only edit transcripts for meetings you have claimed");
  });

  it("lets SUPER_ADMIN edit regardless of claim ownership (break-glass)", async () => {
    const meetingRow = await createMeeting("ENDED");
    const entry = await meetingSvc.appendTranscript(meetingRow.id, { speaker: "Dr. A", content: "original" });
    const superAdminId = process.env.TEST_USER_ID!;

    const edited = await meetingSvc.editTranscriptEntry(entry.id, "admin correction", superAdminId);
    expect(edited.content).toBe("admin correction");
  });
});
