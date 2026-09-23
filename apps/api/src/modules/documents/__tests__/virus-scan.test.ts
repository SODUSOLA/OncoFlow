import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { patient } from "../../patient/schema.js";
import { FileRepository, FileVerificationStepRepository } from "../repository.js";
import { computeFileHash, buildStorageKey } from "../services/StorageService.js";

vi.mock("../services/StorageService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/StorageService.js")>();
  return { ...actual, downloadFromR2: vi.fn().mockResolvedValue(Buffer.from("scanned bytes")) };
});

vi.mock("../services/ClamAvService.js", () => ({
  scanBuffer: vi.fn(),
}));

const app = createApp();
const fileRepo = new FileRepository();
const stepRepo = new FileVerificationStepRepository();

// Inserts a facility and patient for the scan tests and returns the patient id.
async function createTestPatient(): Promise<string> {
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Virus Scan Test Facility", region: "Lagos", address: "V St", status: "ACTIVE",
  }).returning();
  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "VS-TEST-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    firstName: "Scan", lastName: "Test", dob: "1990-01-01", gender: "Male",
    phone: "+2348099994444", email: "scan." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: facRows[0]!.id, status: "ACTIVE",
  }).returning();
  return patRows[0]!.id;
}

// Inserts a file row with unique content for the patient.
async function createTestFile(patientId: string) {
  const content = Buffer.from(`vs-${crypto.randomUUID()}`);
  const hash = computeFileHash(content);
  const row = await fileRepo.create({
    id: crypto.randomUUID(),
    patientId,
    uploadedBy: process.env.TEST_USER_ID!,
    storageKey: buildStorageKey(patientId, "text/plain", hash),
    mimeType: "text/plain",
    virusScanStatus: "PENDING",
    fileHash: hash,
  });
  return row;
}

describe("processVirusScanJob", () => {
  it("transitions PENDING -> CLEAN and writes a fileVerificationStep row", async () => {
    const { scanBuffer } = await import("../services/ClamAvService.js");
    vi.mocked(scanBuffer).mockResolvedValueOnce("CLEAN");
    const { processVirusScanJob } = await import("../queue.js");

    const patientId = await createTestPatient();
    const fileRow = await createTestFile(patientId);

    const result = await processVirusScanJob(fileRow.id);
    expect(result).toBe("CLEAN");

    const updated = await fileRepo.findById(fileRow.id);
    expect(updated!.virusScanStatus).toBe("CLEAN");

    const steps = await stepRepo.findByFile(fileRow.id);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.stepName).toBe("virus_scan");
    expect(steps[0]!.verifiedAt).not.toBeNull();
  });

  it("transitions PENDING -> INFECTED and writes a fileVerificationStep row", async () => {
    const { scanBuffer } = await import("../services/ClamAvService.js");
    vi.mocked(scanBuffer).mockResolvedValueOnce("INFECTED");
    const { processVirusScanJob } = await import("../queue.js");

    const patientId = await createTestPatient();
    const fileRow = await createTestFile(patientId);

    const result = await processVirusScanJob(fileRow.id);
    expect(result).toBe("INFECTED");

    const updated = await fileRepo.findById(fileRow.id);
    expect(updated!.virusScanStatus).toBe("INFECTED");
  });
});

describe("GET /files/:id — INFECTED gate", () => {
  let infectedFileId: string;

  beforeAll(async () => {
    const patientId = await createTestPatient();
    const fileRow = await createTestFile(patientId);
    await fileRepo.updateVirusScanStatus(fileRow.id, "INFECTED");
    infectedFileId = fileRow.id;
  });

  it("blocks an infected file from being served (403), for every caller", async () => {
    const res = await request(app).get(`/files/${infectedFileId}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("infected");
  });

  // The 403 fires from the same status check before any signing, so no presigner mock is needed.
  it("blocks the content route for the same infected file (403)", async () => {
    const res = await request(app).get(`/files/${infectedFileId}/content`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("infected");
  });
});
