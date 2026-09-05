import crypto from "node:crypto";
import { FileRepository } from "./repository.js";
import { File } from "./entities/File.js";
import { computeFileHash, buildStorageKey, uploadToR2, getSignedDownloadUrl } from "./services/StorageService.js";
import { NotFoundError } from "../../lib/errors.js";
import { virusScanQueue } from "./queue.js";

const fileRepo = new FileRepository();

export class FileService {
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

    // Best-effort: an upload that succeeded (bytes are safely in R2, the DB row exists) should
    // not fail the request just because the scan couldn't be enqueued — it stays PENDING and
    // is retriable, same tolerance as the other fire-and-forget hooks in this codebase.
    await virusScanQueue.add("scan", { fileId: row.id }).catch((err) => {
      console.error(`Failed to enqueue virus scan for file ${row.id}:`, err);
    });

    return { file: new File(row).toJSON() };
  }

  async findById(id: string) {
    const row = await fileRepo.findById(id);
    if (!row) throw new NotFoundError("File not found");
    return { file: new File(row).toJSON() };
  }

  async findByPatient(patientId: string) {
    const rows = await fileRepo.findByPatient(patientId);
    return { files: rows.map((r) => new File(r).toJSON()) };
  }

  // Turns an already-authorized file record into somewhere its bytes can actually be fetched
  // from. This method does not itself decide who may see the file — the controller runs the
  // caller-specific ownership/permission and infected-status checks against the record from
  // findById() before ever calling this, same as it already did for the metadata endpoint.
  async getSignedUrl(file: ReturnType<File["toJSON"]>, opts: { forceDownload?: boolean } = {}) {
    const ext = file.mimeType.split("/").pop() ?? "bin";
    return getSignedDownloadUrl(file.storageKey, {
      downloadFileName: opts.forceDownload ? `${file.id}.${ext}` : undefined,
    });
  }
}
