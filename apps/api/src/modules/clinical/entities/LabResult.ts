import type { labRequestStatusEnum } from "../../../db/enums.js";

type LabResultStatus = (typeof labRequestStatusEnum.enumValues)[number];

export interface LabResultData {
  id: string;
  patientId: string;
  requestId: string;
  uploadedBy: string;
  reviewedBy: string | null;
  status: LabResultStatus;
  fileId: string;
  testDate: string;
  fileHash: string;
  possibleDuplicate: boolean;
  createdAt: Date;
}

// Domain entity for an uploaded lab result.
export class LabResult {
  constructor(private data: LabResultData) {}

  get id() { return this.data.id; }
  get patientId() { return this.data.patientId; }
  get requestId() { return this.data.requestId; }
  get uploadedBy() { return this.data.uploadedBy; }
  get reviewedBy() { return this.data.reviewedBy; }
  get status() { return this.data.status; }
  get fileId() { return this.data.fileId; }
  // The date printed on the report, distinct from created_at (the upload time); never derive one from the other.
  get testDate() { return this.data.testDate; }
  get fileHash() { return this.data.fileHash; }
  get possibleDuplicate() { return this.data.possibleDuplicate; }
  get createdAt() { return this.data.createdAt; }

  // Full view — clinical roles (Oncologist, Clinical Director, QA, MO-for-triage).
  toJSON() {
    return {
      id: this.data.id,
      patientId: this.data.patientId,
      requestId: this.data.requestId,
      uploadedBy: this.data.uploadedBy,
      reviewedBy: this.data.reviewedBy,
      status: this.data.status,
      fileId: this.data.fileId,
      testDate: this.data.testDate,
      possibleDuplicate: this.data.possibleDuplicate,
      createdAt: this.data.createdAt.toISOString(),
    };
  }

  // Admin-scoped view ({file_id, test_date, possible_duplicate} only) as its own method so new clinical fields can't leak into it by default.
  toAdminJSON() {
    return {
      fileId: this.data.fileId,
      testDate: this.data.testDate,
      possibleDuplicate: this.data.possibleDuplicate,
    };
  }
}
