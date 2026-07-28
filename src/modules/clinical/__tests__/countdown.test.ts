import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { CountdownCase } from "../entities/CountdownCase";
import { CountdownCaseRepository } from "../repository";
import { CountdownJobService } from "../services/CountdownJobService";
import { db } from "../../../db";
import { countdownCase } from "../schema";
import { patient } from "../../patient/schema";
import { facility } from "../../facility/schema";
import { eq, sql } from "drizzle-orm";

const caseRepo = new CountdownCaseRepository();
const jobSvc = new CountdownJobService();

let testPatientId: string;

beforeAll(async () => {
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Countdown Test", region: "Lagos", address: "C St", status: "ACTIVE",
  }).returning();
  const facId = facRows[0]!.id;

  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "CD-TEST-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    firstName: "Count", lastName: "Down", dob: "1990-01-01", gender: "Male",
    phone: "+2348012345678", email: "cd." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: facId, status: "ACTIVE",
  }).returning();
  testPatientId = patRows[0]!.id;
});

describe("CountdownCase entity — state machine", () => {
  it("starts at day 7 and decrements correctly", () => {
    const c = new CountdownCase({
      id: "1", patientId: testPatientId, currentDay: 7, status: "ACTIVE",
      labsPromptedAt: null, labsUploadedAt: null, resultsSentToQaAt: null,
      paymentConfirmedAt: null, reminderSentAt: null,
    });

    const d6 = c.decrementDay();
    expect(d6.currentDay).toBe(6);
    expect(d6.status).toBe("ACTIVE");
  });

  it("escalates when reaching day 0", () => {
    const c = new CountdownCase({
      id: "2", patientId: testPatientId, currentDay: 1, status: "ACTIVE",
      labsPromptedAt: null, labsUploadedAt: null, resultsSentToQaAt: null,
      paymentConfirmedAt: null, reminderSentAt: null,
    });

    const d0 = c.decrementDay();
    expect(d0.currentDay).toBe(0);
    expect(d0.status).toBe("ESCALATED");
  });

  it("does not go below 0", () => {
    const c = new CountdownCase({
      id: "3", patientId: testPatientId, currentDay: 0, status: "ESCALATED",
      labsPromptedAt: null, labsUploadedAt: null, resultsSentToQaAt: null,
      paymentConfirmedAt: null, reminderSentAt: null,
    });

    const still0 = c.decrementDay();
    expect(still0.currentDay).toBe(0);
  });

  it("each transition stamps only its own field", () => {
    const c = new CountdownCase({
      id: "4", patientId: testPatientId, currentDay: 5, status: "ACTIVE",
      labsPromptedAt: null, labsUploadedAt: null, resultsSentToQaAt: null,
      paymentConfirmedAt: null, reminderSentAt: null,
    });

    const prompted = c.labsPrompted();
    expect(prompted.labsPromptedAt).not.toBeNull();
    expect(prompted.labsUploadedAt).toBeNull();
    expect(prompted.resultsSentToQaAt).toBeNull();

    const uploaded = prompted.labsUploaded();
    expect(uploaded.labsUploadedAt).not.toBeNull();
    expect(uploaded.resultsSentToQaAt).toBeNull();

    const sentToQa = uploaded.resultsSentToQa();
    expect(sentToQa.resultsSentToQaAt).not.toBeNull();

    const paid = sentToQa.paymentConfirmed();
    expect(paid.paymentConfirmedAt).not.toBeNull();
    expect(paid.status).toBe("CLEARED");
  });
});

describe("CountdownJobService — daily decrement", () => {
  it("decrements active cases", async () => {
    const id = crypto.randomUUID();
    await caseRepo.create({
      id, patientId: testPatientId, currentDay: 3, status: "ACTIVE",
    });

    const results = await jobSvc.decrementActiveCases();
    const match = results.find((r) => r.id === id);
    expect(match).toBeDefined();
    expect(match!.day).toBe(2);
    expect(match!.escalated).toBe(false);
  });

  it("escalates at day 0", async () => {
    const id = crypto.randomUUID();
    await caseRepo.create({
      id, patientId: testPatientId, currentDay: 1, status: "ACTIVE",
    });

    const results = await jobSvc.decrementActiveCases();
    const match = results.find((r) => r.id === id);
    expect(match!.day).toBe(0);
    expect(match!.escalated).toBe(true);
  });
});
