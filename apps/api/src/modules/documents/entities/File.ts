import type { virusScanStatusEnum } from "../../../db/enums.js";

type VirusScanStatus = (typeof virusScanStatusEnum.enumValues)[number];

export interface FileData {
  id: string;
  patientId: string | null;
  uploadedBy: string;
  storageKey: string;
  mimeType: string;
  virusScanStatus: VirusScanStatus;
  fileHash: string;
  createdAt: Date;
}

// Domain entity for an uploaded file and its scan status.
export class File {
  constructor(private data: FileData) {}

  get id() { return this.data.id; }
  get patientId() { return this.data.patientId; }
  get uploadedBy() { return this.data.uploadedBy; }
  get storageKey() { return this.data.storageKey; }
  get mimeType() { return this.data.mimeType; }
  get virusScanStatus() { return this.data.virusScanStatus; }
  get fileHash() { return this.data.fileHash; }
  get createdAt() { return this.data.createdAt; }

  // Serializes the file for API responses.
  toJSON() {
    return {
      id: this.data.id,
      patientId: this.data.patientId,
      uploadedBy: this.data.uploadedBy,
      storageKey: this.data.storageKey,
      mimeType: this.data.mimeType,
      virusScanStatus: this.data.virusScanStatus,
      fileHash: this.data.fileHash,
      createdAt: this.data.createdAt.toISOString(),
    };
  }
}
