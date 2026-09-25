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
  // The live (not yet closed) case on this cycle, if one's been started — lets the Schedule show where each
  // visitation stands. lastReviewDecision is QA's latest call on it (a sent-back case still needs the nurse).
  caseId: string | null;
  caseStatus: "STARTED" | "PENDING_QA_REVIEW" | "CLOSED" | null;
  lastReviewDecision?: "REQUIREMENTS_INCOMPLETE" | "REQUIREMENTS_MET" | null;
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
  // Set once the nurse confirms the patient matches their profile photo — resuming skips verification when present.
  identityVerifiedAt?: string | null;
  // Stamped live by the Start / End Infusion buttons.
  infusionStartedAt?: string | null;
  infusionEndedAt?: string | null;
}

// GET /nursing-cases/mine's actual shape: the case joined to its patient's name and MRN, so a case card can
// show who it's for instead of a bare id.
export interface NursingCaseWithPatient extends NursingCase {
  patientFirstName: string;
  patientLastName: string;
  patientUniqueId: string;
}

// GET /nursing-cases?patientId=...'s shape: the patient folder's case history — every visitation on
// record for this patient, across every nurse who's treated them, not just the caller's own cases.
export interface PatientCaseHistoryEntry extends NursingCase {
  cycleNumber: number;
  startedByEmail: string;
}

// GET /nursing-cases/pending-review's shape: the case joined to patient, cycle, and the nurse who started it.
export interface PendingReviewCase extends NursingCase {
  patientFirstName: string;
  patientLastName: string;
  patientUniqueId: string;
  cycleNumber: number;
  startedByEmail: string;
}

// The structured content from the NURSING DOCUMENTATION SHEET — everything on it that isn't already its
// own record elsewhere (vitals, labs/biometrics, and medications are recorded through their own endpoints).
export interface NursingDocumentationSheet {
  id: string;
  nursingCaseId: string;
  authoredBy: string;
  upiCodeEntered: string;
  // Null on sheets submitted since verification moved to the patient's profile photo (no capture any more).
  idPhotoFileId: string | null;
  identityVerifiedAt: string;
  fileReference: string | null;
  diagnosis: string | null;
  managingConsultant: string | null;
  treatmentDate: string | null;
  infusionStartTime: string | null;
  infusionEndTime: string | null;
  note: string | null;
  nextAppointmentDate: string | null;
}

export interface NursingCaseReview {
  id: string;
  nursingCaseId: string;
  reviewedBy: string;
  reviewedAt: string;
  decision: "REQUIREMENTS_INCOMPLETE" | "REQUIREMENTS_MET";
  reason: string | null;
}

// The GET /nursing-cases/:id shape: the case joined to its patient and cycle, plus its documentation sheet
// (once submitted) and any QA reviews.
export interface NursingCaseDetail extends NursingCase {
  patientFirstName: string;
  patientLastName: string;
  patientUniqueId: string;
  patientDob: string;
  patientGender: string;
  patientProfilePictureFileId: string | null;
  cycleNumber: number;
  documentationSheet: NursingDocumentationSheet | null;
  reviews: NursingCaseReview[];
  // False while the case is awaiting QA review (until QA sends it back) or closed — the server enforces it too.
  editable: boolean;
}

// GET /regimen's shape (only the fields the nursing side reads) — diagnosis is stated once by the
// prescribing consultant, not retyped by the nurse at every visit (see DocumentationForm).
export interface RegimenSummary {
  id: string;
  drugName: string;
  protocolCode: string;
  diagnosis: string | null;
  status: "ACTIVE" | "COMPLETED" | "DISCONTINUED" | "PAUSED";
}

export interface FileRecord {
  id: string;
  patientId: string | null;
  uploadedBy: string;
  mimeType: string;
  virusScanStatus: "PENDING" | "CLEAN" | "INFECTED";
  createdAt: string;
}
