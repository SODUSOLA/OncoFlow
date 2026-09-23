import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { LabResultService } from "../service.js";
import { getLabResultHandler } from "../controller.js";
import { db } from "../../../db/index.js";
import { patient } from "../../patient/schema.js";
import { facility } from "../../facility/schema.js";
import { user, role, userRole } from "../../auth/schema.js";
import { file } from "../../documents/schema.js";
import { labRequest } from "../schema.js";
import { sql } from "drizzle-orm";

const labResultSvc = new LabResultService();

let testPatientId: string;
let testFileId: string;
let testRequestId: string;
let testStaffId: string;
let testAdminUserId: string;

// Returns the id of the named role, creating it if missing.
async function ensureRole(name: string) {
  const existing = await db.execute<{ id: string }>(sql`SELECT id FROM "role" WHERE name = ${name} LIMIT 1`);
  if (existing.length > 0) return existing[0]!.id;
  const id = crypto.randomUUID();
  await db.insert(role).values({ id, name: name as never, description: "Test" });
  return id;
}

beforeAll(async () => {
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "LabResult Test Facility", region: "Lagos", address: "LR St", status: "ACTIVE",
  }).returning();
  const facId = facRows[0]!.id;

  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "LRES-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    firstName: "LabResult", lastName: "Test", dob: "1990-01-01", gender: "Female",
    phone: "+2348011115555", email: "lres." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: facId, status: "ACTIVE",
  }).returning();
  testPatientId = patRows[0]!.id;

  const staffRows = await db.insert(user).values({
    id: crypto.randomUUID(), email: "lres-staff-" + crypto.randomUUID().slice(0, 4) + "@test.com", passwordHash: "test",
  }).returning();
  testStaffId = staffRows[0]!.id;

  const adminRoleId = await ensureRole("REGIONAL_ADMIN");
  const adminRows = await db.insert(user).values({
    id: crypto.randomUUID(), email: "lres-admin-" + crypto.randomUUID().slice(0, 4) + "@test.com", passwordHash: "test",
  }).returning();
  testAdminUserId = adminRows[0]!.id;
  await db.insert(userRole).values({ userId: testAdminUserId, roleId: adminRoleId });

  const fileRows = await db.insert(file).values({
    id: crypto.randomUUID(), patientId: testPatientId, uploadedBy: testStaffId,
    storageKey: "test/lab-result.pdf", mimeType: "application/pdf",
    virusScanStatus: "PENDING", fileHash: crypto.randomUUID(),
  }).returning();
  testFileId = fileRows[0]!.id;

  const requestRows = await db.insert(labRequest).values({
    id: crypto.randomUUID(), patientId: testPatientId, requestedBy: testStaffId, status: "PENDING",
  }).returning();
  testRequestId = requestRows[0]!.id;
});

describe("LabResultService — duplicate detection (F3.5 DoD)", () => {
  it("does not flag the first upload of a given hash as a duplicate", async () => {
    const hash = crypto.randomUUID();
    const result = await labResultSvc.upload({
      patientId: testPatientId, requestId: testRequestId, uploadedBy: testStaffId,
      fileId: testFileId, testDate: "2026-08-01", fileHash: hash,
    });
    expect(result.possibleDuplicate).toBe(false);
  });

  it("flags a second upload with an identical hash for the same patient as a duplicate", async () => {
    const hash = crypto.randomUUID();
    await labResultSvc.upload({
      patientId: testPatientId, requestId: testRequestId, uploadedBy: testStaffId,
      fileId: testFileId, testDate: "2026-08-01", fileHash: hash,
    });
    const second = await labResultSvc.upload({
      patientId: testPatientId, requestId: testRequestId, uploadedBy: testStaffId,
      fileId: testFileId, testDate: "2026-08-02", fileHash: hash,
    });
    expect(second.possibleDuplicate).toBe(true);
  });

  it("does not flag the same hash for a different patient", async () => {
    const facRows = await db.insert(facility).values({
      id: crypto.randomUUID(), name: "Other Facility", region: "Lagos", address: "O St", status: "ACTIVE",
    }).returning();
    const otherPatRows = await db.insert(patient).values({
      id: crypto.randomUUID(), uniquePatientId: "LRES2-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
      firstName: "Other", lastName: "Patient", dob: "1990-01-01", gender: "Male",
      phone: "+2348011114444", email: "lres2." + crypto.randomUUID().slice(0, 4) + "@test.com",
      facilityId: facRows[0]!.id, status: "ACTIVE",
    }).returning();

    const hash = crypto.randomUUID();
    await labResultSvc.upload({
      patientId: testPatientId, requestId: testRequestId, uploadedBy: testStaffId,
      fileId: testFileId, testDate: "2026-08-01", fileHash: hash,
    });
    const otherPatientUpload = await labResultSvc.upload({
      patientId: otherPatRows[0]!.id, requestId: testRequestId, uploadedBy: testStaffId,
      fileId: testFileId, testDate: "2026-08-01", fileHash: hash,
    });
    expect(otherPatientUpload.possibleDuplicate).toBe(false);
  });

  it("the duplicate-detection query actually uses the composite index, not a sequential scan", async () => {
    const plan = await db.execute<{ "QUERY PLAN": string }>(sql`
      EXPLAIN SELECT * FROM lab_result
      WHERE file_hash = 'x' AND patient_id = '00000000-0000-0000-0000-000000000000' AND is_deleted = false
    `);
    const planText = plan.map((r) => r["QUERY PLAN"]).join("\n");
    expect(planText).toContain("lab_result_file_hash_patient_test_date_idx");
  });
});

describe("LabResultService — Admin-scoped view (F3.5 DoD)", () => {
  it("Admin read returns only {fileId, testDate, possibleDuplicate} plus the derived fileStatus (F4.6), nothing else", async () => {
    const uploaded = await labResultSvc.upload({
      patientId: testPatientId, requestId: testRequestId, uploadedBy: testStaffId,
      fileId: testFileId, testDate: "2026-08-05", fileHash: crypto.randomUUID(),
    });
    const adminView = await labResultSvc.getForAdmin(uploaded.id);
    expect(Object.keys(adminView).sort()).toEqual(["fileId", "fileStatus", "possibleDuplicate", "testDate"]);
  });

  it("full (clinical) view includes fields the Admin view must never expose", async () => {
    const uploaded = await labResultSvc.upload({
      patientId: testPatientId, requestId: testRequestId, uploadedBy: testStaffId,
      fileId: testFileId, testDate: "2026-08-06", fileHash: crypto.randomUUID(),
    });
    const fullView = await labResultSvc.get(uploaded.id);
    expect(fullView).toHaveProperty("patientId");
    expect(fullView).toHaveProperty("uploadedBy");
    expect(fullView).toHaveProperty("status");
  });

  it("the controller itself routes a REGIONAL_ADMIN caller to the scoped view, end to end", async () => {
    const uploaded = await labResultSvc.upload({
      patientId: testPatientId, requestId: testRequestId, uploadedBy: testStaffId,
      fileId: testFileId, testDate: "2026-08-07", fileHash: crypto.randomUUID(),
    });

    let jsonBody: unknown;
    const fakeReq = { userId: testAdminUserId, params: { id: uploaded.id } } as never;
    const fakeRes = { json: (body: unknown) => { jsonBody = body; }, status: () => fakeRes } as never;

    await getLabResultHandler(fakeReq, fakeRes);

    expect(jsonBody).toBeDefined();
    const labResultBody = (jsonBody as { labResult: Record<string, unknown> }).labResult;
    expect(Object.keys(labResultBody).sort()).toEqual(["fileId", "fileStatus", "possibleDuplicate", "testDate"]);
  });
});
