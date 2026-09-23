import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { ClinicalDecisionService, CountdownCaseService } from "../service.js";
import { ClinicalDecisionRepository } from "../repository.js";
import { db } from "../../../db/index.js";
import { patient } from "../../patient/schema.js";
import { facility } from "../../facility/schema.js";
import { user } from "../../auth/schema.js";
import { file } from "../../documents/schema.js";
import { labRequest, labResult, countdownCase } from "../schema.js";

const clinicalDecisionSvc = new ClinicalDecisionService();
const countdownCaseSvc = new CountdownCaseService();
const clinicalDecisionRepo = new ClinicalDecisionRepository();

let testPatientId: string;
let testQaUserId: string;
let testDirectorUserId: string;

// Inserts a file and lab result for the decision tests.
async function makeLabResult() {
  const fileRows = await db.insert(file).values({
    id: crypto.randomUUID(), patientId: testPatientId, uploadedBy: testQaUserId,
    storageKey: "test/cd-" + crypto.randomUUID() + ".pdf", mimeType: "application/pdf",
    virusScanStatus: "PENDING", fileHash: crypto.randomUUID(),
  }).returning();

  const requestRows = await db.insert(labRequest).values({
    id: crypto.randomUUID(), patientId: testPatientId, requestedBy: testQaUserId, status: "PENDING",
  }).returning();

  const resultRows = await db.insert(labResult).values({
    id: crypto.randomUUID(), patientId: testPatientId, requestId: requestRows[0]!.id, uploadedBy: testQaUserId,
    status: "PENDING", fileId: fileRows[0]!.id, testDate: "2026-08-01", fileHash: crypto.randomUUID(),
  }).returning();

  return resultRows[0]!.id;
}

beforeAll(async () => {
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "ClinicalDecision Test Facility", region: "Lagos", address: "CD St", status: "ACTIVE",
  }).returning();
  const facId = facRows[0]!.id;

  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "CD-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    firstName: "Decision", lastName: "Test", dob: "1990-01-01", gender: "Male",
    phone: "+2348011113333", email: "cd." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: facId, status: "ACTIVE",
  }).returning();
  testPatientId = patRows[0]!.id;

  const qaRows = await db.insert(user).values({
    id: crypto.randomUUID(), email: "cd-qa-" + crypto.randomUUID().slice(0, 4) + "@test.com", passwordHash: "test",
  }).returning();
  testQaUserId = qaRows[0]!.id;

  const directorRows = await db.insert(user).values({
    id: crypto.randomUUID(), email: "cd-director-" + crypto.randomUUID().slice(0, 4) + "@test.com", passwordHash: "test",
  }).returning();
  testDirectorUserId = directorRows[0]!.id;
});

describe("ClinicalDecisionService — hard sequencing guard (F3.6 DoD)", () => {
  it("rejects a final decision when qa_decided_at is still null", async () => {
    const labResultId = await makeLabResult();
    const decisionRow = await clinicalDecisionRepo.create({ id: crypto.randomUUID(), labResultId });

    await expect(
      clinicalDecisionSvc.recordFinalDecision(decisionRow.id, {
        decision: "APPROVED", directorUserId: testDirectorUserId,
      }),
    ).rejects.toThrow("Cannot record a final decision before QA has recorded a recommendation");
  });

  it("full happy path: QA recommends, then Director decides", async () => {
    const labResultId = await makeLabResult();
    const decisionRow = await clinicalDecisionRepo.create({ id: crypto.randomUUID(), labResultId });

    const afterQa = await clinicalDecisionSvc.recordQaRecommendation(decisionRow.id, {
      recommendation: "APPROVED", reason: "Labs within normal range", qaUserId: testQaUserId,
    });
    expect(afterQa.qaDecidedAt).not.toBeNull();
    expect(afterQa.finalDecision).toBeNull();

    const afterDirector = await clinicalDecisionSvc.recordFinalDecision(decisionRow.id, {
      decision: "APPROVED", reason: "Confirmed, proceed to chemo", directorUserId: testDirectorUserId,
    });
    expect(afterDirector.finalDecision).toBe("APPROVED");
    expect(afterDirector.directorId).toBe(testDirectorUserId);
    expect(afterDirector.qaDecidedAt).not.toBeNull();
  });

  it("rejects a second QA recommendation on the same decision", async () => {
    const labResultId = await makeLabResult();
    const decisionRow = await clinicalDecisionRepo.create({ id: crypto.randomUUID(), labResultId });
    await clinicalDecisionSvc.recordQaRecommendation(decisionRow.id, { recommendation: "APPROVED", qaUserId: testQaUserId });

    await expect(
      clinicalDecisionSvc.recordQaRecommendation(decisionRow.id, { recommendation: "DECLINED", qaUserId: testQaUserId }),
    ).rejects.toThrow("QA has already recorded a recommendation");
  });
});

describe("CountdownCase -> ClinicalDecision linkage (F3.6 DoD)", () => {
  it("sending results to QA produces a ClinicalDecision row, not just a timestamp", async () => {
    const caseRows = await db.insert(countdownCase).values({
      id: crypto.randomUUID(), patientId: testPatientId, currentDay: 5, status: "ACTIVE",
      labsPromptedAt: new Date(), labsUploadedAt: new Date(),
    }).returning();
    const labResultId = await makeLabResult();

    const result = await countdownCaseSvc.sendResultsToQa(caseRows[0]!.id, labResultId);

    expect(result.countdownCase.resultsSentToQaAt).not.toBeNull();
    expect(result.clinicalDecision.id).toBeDefined();
    expect(result.clinicalDecision.labResultId).toBe(labResultId);
    expect(result.clinicalDecision.qaDecidedAt).toBeNull();

    const fetched = await clinicalDecisionSvc.getByLabResult(labResultId);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(result.clinicalDecision.id);
  });

  it("rejects sending results to QA before labs are uploaded", async () => {
    const caseRows = await db.insert(countdownCase).values({
      id: crypto.randomUUID(), patientId: testPatientId, currentDay: 6, status: "ACTIVE",
      labsPromptedAt: new Date(),
    }).returning();
    const labResultId = await makeLabResult();

    await expect(countdownCaseSvc.sendResultsToQa(caseRows[0]!.id, labResultId))
      .rejects.toThrow("Cannot send results to QA before labs are uploaded");
  });
});
