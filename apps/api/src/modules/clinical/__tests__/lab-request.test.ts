import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { LabRequestService, LabResultService } from "../service.js";
import { db } from "../../../db/index.js";
import { patient } from "../../patient/schema.js";
import { facility } from "../../facility/schema.js";
import { user } from "../../auth/schema.js";
import { FileRepository } from "../../documents/index.js";
import { computeFileHash, buildStorageKey } from "../../documents/services/StorageService.js";

const labRequestSvc = new LabRequestService();
const labResultSvc = new LabResultService();
const fileRepo = new FileRepository();

let testPatientId: string;
let testStaffId: string;

beforeAll(async () => {
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "LabRequest Test Facility", region: "Lagos", address: "L St", status: "ACTIVE",
  }).returning();
  const facId = facRows[0]!.id;

  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "LR-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    firstName: "Lab", lastName: "Test", dob: "1990-01-01", gender: "Male",
    phone: "+2348011116666", email: "lr." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: facId, status: "ACTIVE",
  }).returning();
  testPatientId = patRows[0]!.id;

  const staffRows = await db.insert(user).values({
    id: crypto.randomUUID(), email: "lr-staff-" + crypto.randomUUID().slice(0, 4) + "@test.com", passwordHash: "test",
  }).returning();
  testStaffId = staffRows[0]!.id;
});

describe("LabRequestService — CRUD + status transitions (F3.4 DoD)", () => {
  it("creates a lab request in PENDING status", async () => {
    const result = await labRequestSvc.create({ patientId: testPatientId, requestedBy: testStaffId });
    expect(result.status).toBe("PENDING");
  });

  it("transitions PENDING -> UPLOADED -> REVIEWED", async () => {
    const created = await labRequestSvc.create({ patientId: testPatientId, requestedBy: testStaffId });
    const uploaded = await labRequestSvc.markUploaded(created.id);
    expect(uploaded.status).toBe("UPLOADED");
    const reviewed = await labRequestSvc.markReviewed(created.id);
    expect(reviewed.status).toBe("REVIEWED");
  });

  it("rejects skipping straight from PENDING to REVIEWED", async () => {
    const created = await labRequestSvc.create({ patientId: testPatientId, requestedBy: testStaffId });
    await expect(labRequestSvc.markReviewed(created.id)).rejects.toThrow("Cannot transition from PENDING to REVIEWED");
  });

  it("rejects transitioning an already-REVIEWED request further", async () => {
    const created = await labRequestSvc.create({ patientId: testPatientId, requestedBy: testStaffId });
    await labRequestSvc.markUploaded(created.id);
    await labRequestSvc.markReviewed(created.id);
    await expect(labRequestSvc.markUploaded(created.id)).rejects.toThrow("Cannot transition from REVIEWED to UPLOADED");
  });

  it("lists lab requests by patient", async () => {
    const results = await labRequestSvc.listByPatient(testPatientId);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.patientId === testPatientId)).toBe(true);
  });

  it("throws NotFoundError for an unknown id", async () => {
    await expect(labRequestSvc.get(crypto.randomUUID())).rejects.toThrow("Lab request not found");
  });
});

describe("LabRequestService.markReviewed — F4.6 virus-scan gate", () => {
  async function createFile(status: "PENDING" | "CLEAN" | "INFECTED") {
    const content = Buffer.from(`gate-${crypto.randomUUID()}`);
    const hash = computeFileHash(content);
    return fileRepo.create({
      id: crypto.randomUUID(),
      patientId: testPatientId,
      uploadedBy: testStaffId,
      storageKey: buildStorageKey(testPatientId, "application/pdf", hash),
      mimeType: "application/pdf",
      virusScanStatus: status,
      fileHash: hash,
    });
  }

  it("rejects reviewing a request whose result's file is still PENDING scan", async () => {
    const created = await labRequestSvc.create({ patientId: testPatientId, requestedBy: testStaffId });
    const fileRow = await createFile("PENDING");
    await labResultSvc.upload({
      patientId: testPatientId, requestId: created.id, uploadedBy: testStaffId,
      fileId: fileRow.id, testDate: "2026-01-01", fileHash: fileRow.fileHash,
    });

    await expect(labRequestSvc.markReviewed(created.id)).rejects.toThrow(
      "Cannot review a lab result whose file is not yet scanned clean",
    );
  });

  it("rejects reviewing a request whose result's file came back INFECTED", async () => {
    const created = await labRequestSvc.create({ patientId: testPatientId, requestedBy: testStaffId });
    const fileRow = await createFile("INFECTED");
    await labResultSvc.upload({
      patientId: testPatientId, requestId: created.id, uploadedBy: testStaffId,
      fileId: fileRow.id, testDate: "2026-01-01", fileHash: fileRow.fileHash,
    });

    await expect(labRequestSvc.markReviewed(created.id)).rejects.toThrow(
      "Cannot review a lab result whose file is not yet scanned clean",
    );
  });

  it("allows reviewing once the file has come back CLEAN", async () => {
    const created = await labRequestSvc.create({ patientId: testPatientId, requestedBy: testStaffId });
    const fileRow = await createFile("CLEAN");
    await labResultSvc.upload({
      patientId: testPatientId, requestId: created.id, uploadedBy: testStaffId,
      fileId: fileRow.id, testDate: "2026-01-01", fileHash: fileRow.fileHash,
    });

    const reviewed = await labRequestSvc.markReviewed(created.id);
    expect(reviewed.status).toBe("REVIEWED");
  });

  it("exposes fileStatus on the LabResult read paths", async () => {
    const created = await labRequestSvc.create({ patientId: testPatientId, requestedBy: testStaffId });
    const fileRow = await createFile("CLEAN");
    const uploaded = await labResultSvc.upload({
      patientId: testPatientId, requestId: created.id, uploadedBy: testStaffId,
      fileId: fileRow.id, testDate: "2026-01-01", fileHash: fileRow.fileHash,
    });

    const fetched = await labResultSvc.get(uploaded.id);
    expect(fetched.fileStatus).toBe("CLEAN");
  });
});
