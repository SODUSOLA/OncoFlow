import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { patient } from "../../patient/schema.js";
import { user, session } from "../../auth/schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { FileRepository } from "../repository.js";
import { File } from "../entities/File.js";
import { computeFileHash, buildStorageKey } from "../services/StorageService.js";
import { config } from "../../../config.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Creates a real patient row because file.patient_id has an FK a random uuid would violate.
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

// Creates a logged-in user with no roles, via a real session cookie, to assert non-owners get the same 403 as the metadata route.
async function createSessionCookie(): Promise<{ userId: string; cookie: string }> {
  const userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId, email: `doc-owner-test-${crypto.randomUUID()}@example.com`, passwordHash: "test",
  });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  return { userId, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

vi.mock("@aws-sdk/client-s3", () => {
  const send = vi.fn().mockResolvedValue({});
  return {
    S3Client: vi.fn(() => ({ send })),
    PutObjectCommand: vi.fn(),
    GetObjectCommand: vi.fn((input: { Bucket: string; Key: string }) => input),
  };
});

// Mocks the presigner because getSignedUrl needs real client config, so the tests exercise only the route's own logic.
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(
    (_client: unknown, command: { Bucket: string; Key: string }) =>
      `https://mock-r2.example.com/${command.Bucket}/${command.Key}?mock-signature=1`,
  ),
}));

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

  // Regression: the old 100kb body limit (75kb of file after base64) rejected realistic uploads with a generic 500; 500kb is past the old limit and inside the new one.
  it("accepts a file far larger than the old 100kb body limit", async () => {
    const pid = await createTestPatient();
    const content = Buffer.alloc(500 * 1024, "a");
    const res = await request(app)
      .post("/files/upload")
      .send({ patientId: pid, mimeType: "application/pdf", content: content.toString("base64") });

    expect(res.status).toBe(201);
    expect(res.body.file.fileHash).toBe(computeFileHash(content));
  });

  // The controller enforces the limit on decoded bytes to report the real file limit; maxUploadBytes is lowered so the parser doesn't reject first.
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

// The content-serving half of the pair: uploads reached R2 but nothing read them back to a browser.
describe("GET /files/:id/content — signed download", () => {
  let uploadedId: string;
  let uploadedStorageKey: string;

  beforeAll(async () => {
    const content = Buffer.from("download-route-test").toString("base64");
    const res = await request(app)
      .post("/files/upload")
      .send({ mimeType: "application/pdf", content });
    uploadedId = res.body.file.id;
    uploadedStorageKey = res.body.file.storageKey;
  });

  it("redirects to a signed URL rather than returning JSON", async () => {
    const res = await request(app).get(`/files/${uploadedId}/content`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("mock-r2.example.com");
    expect(res.headers.location).toContain(uploadedStorageKey);
  });

  it("marks the redirect uncacheable, per Gate 6's 'fresh check on every access' rule", async () => {
    const res = await request(app).get(`/files/${uploadedId}/content`);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("does not force a download by default — an <img> tag should render it inline", async () => {
    vi.mocked(getSignedUrl).mockClear();
    await request(app).get(`/files/${uploadedId}/content`);
    const [, command] = vi.mocked(getSignedUrl).mock.calls.at(-1)!;
    expect((command as { ResponseContentDisposition?: string }).ResponseContentDisposition).toBeUndefined();
  });

  it("sets Content-Disposition: attachment with the file's own id and extension when ?download=true", async () => {
    vi.mocked(getSignedUrl).mockClear();
    await request(app).get(`/files/${uploadedId}/content?download=true`);
    const [, command] = vi.mocked(getSignedUrl).mock.calls.at(-1)!;
    expect((command as { ResponseContentDisposition?: string }).ResponseContentDisposition)
      .toBe(`attachment; filename="${uploadedId}.pdf"`);
  });

  it("returns 404 for a non-existent file", async () => {
    const res = await request(app).get(`/files/${crypto.randomUUID()}/content`);
    expect(res.status).toBe(404);
  });

  // Same ownership-or-permission rule as the metadata route, so outsiders are refused the bytes too.
  it("returns 403 for a caller who is neither the file's owner nor holds file:read", async () => {
    const outsider = await createSessionCookie();
    const res = await request(app).get(`/files/${uploadedId}/content`).set("Cookie", outsider.cookie);
    expect(res.status).toBe(403);
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
