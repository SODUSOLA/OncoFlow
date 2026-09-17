// ONCOFLOW_NURSING_OFFICER_BUILD_GUIDE.md — shapes matching apps/api/src/modules/nursing and
// the clinical-metrics module's /regimen-cycles endpoint.

export interface RegimenCycleRow {
  id: string;
  cycleNumber: number;
  scheduledDate: string;
  status: "SCHEDULED" | "COMPLETED" | "DELAYED" | "SKIPPED";
  drugName: string;
  protocolCode: string;
  patientId: string;
  firstName: string;
  lastName: string;
  uniquePatientId: string;
  profilePictureFileId: string | null;
}

export interface NursingCase {
  id: string;
  patientId: string;
  regimenCycleId: string;
  startedBy: string;
  startedAt: string;
  status: "STARTED" | "PENDING_QA_REVIEW" | "CLOSED";
  closedBy: string | null;
  closedAt: string | null;
}

export interface NursingDocumentationSheet {
  id: string;
  nursingCaseId: string;
  authoredBy: string;
  upiCodeEntered: string;
  idPhotoFileId: string;
  identityVerifiedAt: string;
  fileReference: string;
}

export interface NursingCaseReview {
  id: string;
  nursingCaseId: string;
  reviewedBy: string;
  reviewedAt: string;
  decision: "REQUIREMENTS_INCOMPLETE" | "REQUIREMENTS_MET";
  reason: string | null;
}

export interface FileRecord {
  id: string;
  patientId: string | null;
  uploadedBy: string;
  mimeType: string;
  virusScanStatus: "PENDING" | "CLEAN" | "INFECTED";
  createdAt: string;
}
