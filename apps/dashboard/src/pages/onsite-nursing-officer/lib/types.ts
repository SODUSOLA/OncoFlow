// Types matching the nursing module and the /regimen-cycles endpoint.

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

// GET /nursing-cases/mine's actual shape: the case joined to its patient's name and MRN, so a case card can
// show who it's for instead of a bare id.
export interface NursingCaseWithPatient extends NursingCase {
  patientFirstName: string;
  patientLastName: string;
  patientUniqueId: string;
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

// The GET /nursing-cases/:id shape: the case joined to its patient, plus its documentation sheet (once
// submitted) and any QA reviews.
export interface NursingCaseDetail extends NursingCase {
  patientFirstName: string;
  patientLastName: string;
  patientUniqueId: string;
  patientDob: string;
  patientGender: string;
  documentationSheet: NursingDocumentationSheet | null;
  reviews: NursingCaseReview[];
}

export interface FileRecord {
  id: string;
  patientId: string | null;
  uploadedBy: string;
  mimeType: string;
  virusScanStatus: "PENDING" | "CLEAN" | "INFECTED";
  createdAt: string;
}
