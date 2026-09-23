import crypto from "node:crypto";
import { FileRepository } from "./repository.js";
import { File } from "./entities/File.js";
import { computeFileHash, buildStorageKey, uploadToR2, getSignedDownloadUrl } from "./services/StorageService.js";
import { NotFoundError } from "../../lib/errors.js";
import { virusScanQueue } from "./queue.js";

const fileRepo = new FileRepository();

// Business logic for storing and reading files.
export class FileService {
  // Hashes and stores the file in R2, creates its row and queues a virus scan.
  async upload(data: {
    patientId?: string;
    uploadedBy: string;
    mimeType: string;
    content: Buffer;
  }) {
    const fileHash = computeFileHash(data.content);
    const patientId = data.patientId ?? null;
    const storageKey = buildStorageKey(patientId, data.mimeType, fileHash);

    await uploadToR2(data.content, storageKey, data.mimeType);

    const row = await fileRepo.create({
      id: crypto.randomUUID(),
      patientId,
      uploadedBy: data.uploadedBy,
      storageKey,
      mimeType: data.mimeType,
      virusScanStatus: "PENDING",
      fileHash,
    });

    // Best-effort: a failed enqueue leaves the file PENDING and retriable instead of failing an upload that succeeded.
    await virusScanQueue.add("scan", { fileId: row.id }).catch((err) => {
      console.error(`Failed to enqueue virus scan for file ${row.id}:`, err);
    });

    return { file: new File(row).toJSON() };
  }

  // Returns a file or throws NotFoundError.
  async findById(id: string) {
    const row = await fileRepo.findById(id);
    if (!row) throw new NotFoundError("File not found");
    return { file: new File(row).toJSON() };
  }

  // Lists a patient's files.
  async findByPatient(patientId: string) {
    const rows = await fileRepo.findByPatient(patientId);
    return { files: rows.map((r) => new File(r).toJSON()) };
  }

  // Builds a fetchable URL for an already-authorized file; the controller performs the access checks first.
  async getSignedUrl(file: ReturnType<File["toJSON"]>, opts: { forceDownload?: boolean } = {}) {
    const ext = file.mimeType.split("/").pop() ?? "bin";
    return getSignedDownloadUrl(file.storageKey, {
      downloadFileName: opts.forceDownload ? `${file.id}.${ext}` : undefined,
    });
  }
}
