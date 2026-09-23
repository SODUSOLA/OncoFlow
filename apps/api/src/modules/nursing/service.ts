import crypto from "node:crypto";
import {
  NursingCaseRepository, NursingCaseReviewRepository, NursingDocumentationSheetRepository, UploadSecurityIncidentRepository,
} from "./repository.js";
import { FileRepository } from "../documents/index.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors.js";

const caseRepo = new NursingCaseRepository();
const reviewRepo = new NursingCaseReviewRepository();
const sheetRepo = new NursingDocumentationSheetRepository();
const incidentRepo = new UploadSecurityIncidentRepository();
const fileRepo = new FileRepository();

// Generates a display reference such as "#8842-X" for a security incident.
function generateIncidentReference(): string {
  // Four random digits plus a fixed "-X" suffix matching the design; only displayed, so collisions don't matter.
  const digits = crypto.randomInt(1000, 10000);
  return `#${digits}-X`;
}

// Business logic for nursing cases, documentation sheets, security incidents and QA review.
export class NursingCaseService {
  // The nurse's own Confirm Case Started action; refuses to start a second case on a cycle that already has a live one.
  async startCase(patientId: string, regimenCycleId: string, startedBy: string) {
    const existing = await caseRepo.findOpenByRegimenCycle(regimenCycleId);
    if (existing) {
      throw new ConflictError("A case is already open for this visitation");
    }
    const row = await caseRepo.create({
      id: crypto.randomUUID(), patientId, regimenCycleId, startedBy, status: "STARTED",
    });
    return row;
  }

  // Returns a case (with its patient's name/MRN, for the case detail page) or throws NotFoundError.
  async getById(id: string) {
    const row = await caseRepo.findByIdWithPatient(id);
    if (!row) throw new NotFoundError("Nursing case not found");
    const [sheet, reviews] = await Promise.all([sheetRepo.findByCase(id), reviewRepo.findByCase(id)]);
    return { ...row, documentationSheet: sheet, reviews };
  }

  // Lists cases started by the nurse.
  async listMine(startedBy: string) {
    return caseRepo.findByStartedBy(startedBy);
  }

  // Lists cases awaiting QA review.
  async listPendingReview() {
    return caseRepo.findPendingReview();
  }

  // Steps 3-5 collapse into one call once the interlocked upload succeeds, moving the case out of STARTED.
  async submitDocumentationSheet(
    caseId: string, callerId: string,
    data: { upiCodeEntered: string; idPhotoFileId: string; fileReference: string },
  ) {
    const caseRow = await caseRepo.findById(caseId);
    if (!caseRow) throw new NotFoundError("Nursing case not found");
    if (caseRow.startedBy !== callerId) throw new ForbiddenError("You can only document your own case");
    if (caseRow.status !== "STARTED") throw new ConflictError(`Cannot submit documentation for a case in status ${caseRow.status}`);

    // Both files must exist and be CLEAN; the client-side safety interlock is backstopped here, not trusted.
    for (const fileId of [data.idPhotoFileId, data.fileReference]) {
      const fileRow = await fileRepo.findById(fileId);
      if (!fileRow) throw new NotFoundError(`Referenced file ${fileId} not found`);
      if (fileRow.uploadedBy !== callerId) throw new ForbiddenError("Referenced file was not uploaded by you");
      if (fileRow.virusScanStatus !== "CLEAN") throw new ConflictError(`File ${fileId} has not cleared the safety scan (status: ${fileRow.virusScanStatus})`);
    }

    const now = new Date();
    const sheet = await sheetRepo.create({
      id: crypto.randomUUID(), nursingCaseId: caseId, authoredBy: callerId,
      upiCodeEntered: data.upiCodeEntered, idPhotoFileId: data.idPhotoFileId,
      identityVerifiedAt: now, fileReference: data.fileReference,
    });
    const updated = await caseRepo.update(caseId, { status: "PENDING_QA_REVIEW" });
    return { case: updated!, documentationSheet: sheet };
  }

  // Records an incident for an INFECTED file with a reference number, feeding Regional Admin's alerts via GET /security-incidents.
  async reportSecurityIncident(callerId: string, fileId: string, nursingCaseId?: string) {
    const fileRow = await fileRepo.findById(fileId);
    if (!fileRow) throw new NotFoundError("File not found");
    if (fileRow.uploadedBy !== callerId) throw new ForbiddenError("You can only report an incident for a file you uploaded");
    if (fileRow.virusScanStatus !== "INFECTED") {
      throw new ConflictError("This file has not been flagged by the safety scan");
    }
    return incidentRepo.create({
      id: crypto.randomUUID(), nursingCaseId: nursingCaseId ?? null, attemptedBy: callerId,
      fileScanResult: fileRow.virusScanStatus, incidentReference: generateIncidentReference(),
    });
  }

  // Lists the most recent security incidents.
  async listRecentSecurityIncidents(limit: number) {
    return incidentRepo.findRecent(limit);
  }

  // QA reviews the case as a whole: MET records the review and closes it, INCOMPLETE records the reason and leaves it PENDING_QA_REVIEW (no returned state exists).
  async review(caseId: string, reviewedBy: string, decision: "REQUIREMENTS_INCOMPLETE" | "REQUIREMENTS_MET", reason?: string) {
    const caseRow = await caseRepo.findById(caseId);
    if (!caseRow) throw new NotFoundError("Nursing case not found");
    if (caseRow.status !== "PENDING_QA_REVIEW") {
      throw new ConflictError(`Cannot review a case in status ${caseRow.status}`);
    }
    if (decision === "REQUIREMENTS_INCOMPLETE" && !reason?.trim()) {
      throw new ConflictError("A reason is required when requirements are incomplete");
    }

    const review = await reviewRepo.create({
      id: crypto.randomUUID(), nursingCaseId: caseId, reviewedBy, decision, reason: reason ?? null,
    });

    let updatedCase = caseRow;
    if (decision === "REQUIREMENTS_MET") {
      updatedCase = (await caseRepo.update(caseId, { status: "CLOSED", closedBy: reviewedBy, closedAt: new Date() }))!;
    }
    return { case: updatedCase, review };
  }
}

export const nursingCaseService = new NursingCaseService();
