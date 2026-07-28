import crypto from "node:crypto";
import { FileRepository } from "./repository";
import { File } from "./entities/File";
import { computeFileHash, buildStorageKey, uploadToR2 } from "./services/StorageService";
import { NotFoundError } from "../../lib/errors";

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
}
