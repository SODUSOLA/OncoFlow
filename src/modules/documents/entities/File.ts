import type { virusScanStatusEnum } from "../../../db/enums";

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
