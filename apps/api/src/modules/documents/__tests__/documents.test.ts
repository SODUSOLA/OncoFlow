import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { patient } from "../../patient/schema.js";
import { FileRepository } from "../repository.js";
import { File } from "../entities/File.js";
import { computeFileHash, buildStorageKey } from "../services/StorageService.js";
import { config } from "../../../config.js";

// file.patient_id has a real FK to patient.id — a bare crypto.randomUUID() with no matching
// row (what several tests below used to pass) trips that constraint. This creates one real
// patient row tests can share/reference instead.
async function createTestPatient(): Promise<string> {
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Documents Test Facility", region: "Lagos", address: "D St", status: "ACTIVE",
  }).returning();
  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "DOC-TEST-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    firstName: "Doc", lastName: "Test", dob: "1990-01-01", gender: "Male",
    phone: "+2348099993333", email: "doc." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: facRows[0]!.id, status: "ACTIVE",
  }).returning();
  return patRows[0]!.id;
}

vi.mock("@aws-sdk/client-s3", () => {
  const send = vi.fn().mockResolvedValue({});
  return {
    S3Client: vi.fn(() => ({ send })),
    PutObjectCommand: vi.fn(),
  };
});

const app = createApp();
const repo = new FileRepository();

const sampleContent = Buffer.from("test file content for F3.0 documents module");
const sampleHash = computeFileHash(sampleContent);

describe("StorageService — computeFileHash", () => {
  it("returns a deterministic sha256 hex string", () => {
    const hash1 = computeFileHash(sampleContent);
    const hash2 = computeFileHash(sampleContent);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("produces different hashes for different content", () => {
    const hash1 = computeFileHash(Buffer.from("hello"));
    const hash2 = computeFileHash(Buffer.from("world"));
    expect(hash1).not.toBe(hash2);
  });
});

describe("StorageService — buildStorageKey", () => {
  it("builds key with patient prefix when patientId is provided", () => {
    const pid = crypto.randomUUID();
    const key = buildStorageKey(pid, "application/pdf", sampleHash);
    expect(key).toContain(`patients/${pid}`);
    expect(key).toContain(sampleHash);
    expect(key).toContain(".pdf");
  });

  it("builds key with unattached prefix when patientId is null", () => {
    const key = buildStorageKey(null, "image/png", sampleHash);
    expect(key).toContain("unattached");
    expect(key).toContain(sampleHash);
    expect(key).toContain(".png");
  });
});

describe("File entity", () => {
  it("returns correct JSON representation", () => {
    const now = new Date();
    const data = {
      id: crypto.randomUUID(),
      patientId: crypto.randomUUID(),
      uploadedBy: crypto.randomUUID(),
      storageKey: "patients/abc/123/hash.pdf",
      mimeType: "application/pdf",
      virusScanStatus: "PENDING" as const,
      fileHash: sampleHash,
      createdAt: now,
    };
    const entity = new File(data);
    const json = entity.toJSON();
    expect(json.id).toBe(data.id);
    expect(json.mimeType).toBe("application/pdf");
    expect(json.virusScanStatus).toBe("PENDING");
    expect(json.fileHash).toBe(sampleHash);
  });
});

describe("FileRepository", () => {
  let testFileId: string;
  let testPatientId: string;
  let testUploadedBy: string;

  beforeAll(async () => {
    testPatientId = await createTestPatient();
    testUploadedBy = process.env.TEST_USER_ID!;
    const row = await repo.create({
      id: crypto.randomUUID(),
      patientId: testPatientId,
      uploadedBy: testUploadedBy,
      storageKey: buildStorageKey(testPatientId, "text/plain", sampleHash),
      mimeType: "text/plain",
      virusScanStatus: "PENDING",
      fileHash: sampleHash,
    });
    testFileId = row.id;
  });

  it("finds a file by id", async () => {
    const row = await repo.findById(testFileId);
    expect(row).not.toBeNull();
    expect(row!.id).toBe(testFileId);
    expect(row!.mimeType).toBe("text/plain");
  });

  it("finds files by patient", async () => {
    const rows = await repo.findByPatient(testPatientId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.patientId).toBe(testPatientId);
  });

  it("finds files by hash for a patient", async () => {
    const rows = await repo.findByHash(testPatientId, sampleHash);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("soft-deletes a file", async () => {
    const delId = crypto.randomUUID();
    await repo.create({
      id: delId,
      uploadedBy: testUploadedBy,
      storageKey: "test/delete-me.txt",
      mimeType: "text/plain",
      virusScanStatus: "PENDING",
      fileHash: computeFileHash(Buffer.from("delete me")),
    });
    const deleted = await repo.softDelete(delId);
    expect(deleted).not.toBeNull();
    const gone = await repo.findById(delId);
    expect(gone).toBeNull();
  });

  it("virus_scan_status is PENDING on newly created files", async () => {
    const row = await repo.findById(testFileId);
    expect(row!.virusScanStatus).toBe("PENDING");
  });
});

describe("FileService — upload", () => {
  it("uploads a file and returns a File record with virus_scan_status PENDING", async () => {
    const pid = await createTestPatient();
    const content = Buffer.from("upload test content");
    const b64 = content.toString("base64");
    const res = await request(app)
      .post("/files/upload")
      .send({ patientId: pid, mimeType: "image/png", content: b64 });
    expect(res.status).toBe(201);
    expect(res.body.file).toBeDefined();
    expect(res.body.file.mimeType).toBe("image/png");
    expect(res.body.file.virusScanStatus).toBe("PENDING");
    expect(res.body.file.fileHash).toBe(computeFileHash(content));
  });

  // The reported bug: uploading a document or a voice note failed with
  // {"error":"Internal server error","code":"INTERNAL_ERROR"}. The cause was express.json()'s
  // 100kb default body limit — and because uploads are base64 in a JSON body (4/3 inflation),
  // the real file ceiling was about 75kb, which almost any photo, PDF or voice note exceeds.
  // 500kb here is comfortably past the old limit and comfortably inside the new one.
  it("accepts a file far larger than the old 100kb body limit", async () => {
    const pid = await createTestPatient();
    const content = Buffer.alloc(500 * 1024, "a");
    const res = await request(app)
      .post("/files/upload")
      .send({ patientId: pid, mimeType: "application/pdf", content: content.toString("base64") });

    expect(res.status).toBe(201);
    expect(res.body.file.fileHash).toBe(computeFileHash(content));
  });

  // The limit is enforced on decoded bytes in the controller as well as by the parser, so it
  // can report the actual file limit rather than a generic complaint about the envelope.
  // maxUploadBytes is lowered here because the parser budget is derived from it at import and
  // would otherwise reject the request first — this exercises the controller's own branch.
  it("rejects a file over the configured limit with 413, naming the limit", async () => {
    const pid = await createTestPatient();
    const original = config.maxUploadBytes;
    try {
      Object.assign(config, { maxUploadBytes: 1024 });
      const res = await request(app)
        .post("/files/upload")
        .send({
          patientId: pid, mimeType: "application/pdf",
          content: Buffer.alloc(4096, "b").toString("base64"),
        });

      expect(res.status).toBe(413);
      expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
      expect(res.body.error).toMatch(/too large/i);
    } finally {
      Object.assign(config, { maxUploadBytes: original });
    }
  });

  it("returns 400 when mimeType is missing", async () => {
    const res = await request(app)
      .post("/files/upload")
      .send({ content: Buffer.from("x").toString("base64") });
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is missing", async () => {
    const res = await request(app)
      .post("/files/upload")
      .send({ mimeType: "text/plain" });
    expect(res.status).toBe(400);
  });
});

describe("FileService — get file by id", () => {
  let uploadedId: string;

  beforeAll(async () => {
    const content = Buffer.from("get-test").toString("base64");
    const res = await request(app)
      .post("/files/upload")
      .send({ mimeType: "text/plain", content });
    uploadedId = res.body.file.id;
  });

  it("returns the file by id", async () => {
    const res = await request(app).get(`/files/${uploadedId}`);
    expect(res.status).toBe(200);
    expect(res.body.file.id).toBe(uploadedId);
    expect(res.body.file.mimeType).toBe("text/plain");
    expect(res.body.file.virusScanStatus).toBe("PENDING");
  });

  it("returns 404 for non-existent file", async () => {
    const res = await request(app).get(`/files/${crypto.randomUUID()}`);
    expect(res.status).toBe(404);
  });
});

describe("FileService — list by patient", () => {
  let testPatientId: string;

  beforeAll(async () => {
    testPatientId = await createTestPatient();
    const content = Buffer.from("list-test").toString("base64");
    await request(app)
      .post("/files/upload")
      .send({ patientId: testPatientId, mimeType: "text/plain", content });
    await request(app)
      .post("/files/upload")
      .send({ patientId: testPatientId, mimeType: "application/pdf", content });
  });

  it("returns files for the patient", async () => {
    const res = await request(app).get(`/files?patientId=${testPatientId}`);
    expect(res.status).toBe(200);
    expect(res.body.files).toHaveLength(2);
  });

  it("returns 400 without patientId", async () => {
    const res = await request(app).get("/files");
    expect(res.status).toBe(400);
  });
});
