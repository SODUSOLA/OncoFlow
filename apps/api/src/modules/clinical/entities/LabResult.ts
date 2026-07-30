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

export class LabResult {
  constructor(private data: LabResultData) {}

  get id() { return this.data.id; }
  get patientId() { return this.data.patientId; }
  get requestId() { return this.data.requestId; }
  get uploadedBy() { return this.data.uploadedBy; }
  get reviewedBy() { return this.data.reviewedBy; }
  get status() { return this.data.status; }
  get fileId() { return this.data.fileId; }
  // test_date is the date printed on the report itself — distinct from created_at (the
  // upload timestamp). Never derive one from the other.
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

  // F3.5 Admin-scoping rule: {file_id, test_date, possible_duplicate} ONLY — a distinct
  // method, not a "hide some fields" flag on toJSON(), so a future clinical field added to
  // the table can't accidentally leak into the Admin view by default.
  toAdminJSON() {
    return {
      fileId: this.data.fileId,
      testDate: this.data.testDate,
      possibleDuplicate: this.data.possibleDuplicate,
    };
  }
}
