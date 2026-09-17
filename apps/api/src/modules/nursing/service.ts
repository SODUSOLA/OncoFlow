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

function generateIncidentReference(): string {
  // "#8842-X" style per the mockup's error screen — a real, unique-enough reference, not
  // decorative: 4 random digits (collision odds are a non-issue at this volume; nothing keys
  // off this string except display) plus a fixed "-X" suffix matching the design.
  const digits = crypto.randomInt(1000, 10000);
  return `#${digits}-X`;
}

export class NursingCaseService {
  // Step 2's "Confirm Case Started" — the Nursing Officer's own action, no cross-role co-sign
  // gate. Refuses to double-start a case against a regimen cycle that already has a live one.
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

  async getById(id: string) {
    const row = await caseRepo.findById(id);
    if (!row) throw new NotFoundError("Nursing case not found");
    const [sheet, reviews] = await Promise.all([sheetRepo.findByCase(id), reviewRepo.findByCase(id)]);
    return { ...row, documentationSheet: sheet, reviews };
  }

  async listMine(startedBy: string) {
    return caseRepo.findByStartedBy(startedBy);
  }

  async listPendingReview() {
    return caseRepo.findPendingReview();
  }

  // Steps 3-5 of the wizard collapse into one call once the safety-interlocked upload actually
  // succeeds — this is the real case-content-accumulation step (§2 of the build guide), and it's
  // what transitions the case out of STARTED.
  async submitDocumentationSheet(
    caseId: string, callerId: string,
    data: { upiCodeEntered: string; idPhotoFileId: string; fileReference: string },
  ) {
    const caseRow = await caseRepo.findById(caseId);
    if (!caseRow) throw new NotFoundError("Nursing case not found");
    if (caseRow.startedBy !== callerId) throw new ForbiddenError("You can only document your own case");
    if (caseRow.status !== "STARTED") throw new ConflictError(`Cannot submit documentation for a case in status ${caseRow.status}`);

    // Both referenced files must exist and have actually cleared the virus scan — the
    // safety-interlock this wizard enforces client-side (Step 5's toggle) is backstopped here,
    // not trusted from the client alone.
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

  // Error path — the file's own virus-scan pipeline flagged it INFECTED. Real row, real
  // reference number, feeds Regional Admin's alert aggregator (read via GET /security-incidents,
  // no separate notification system per Finding 3).
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

  async listRecentSecurityIncidents(limit: number) {
    return incidentRepo.findRecent(limit);
  }

  // QA reviewing the case as a whole (documentation sheet + any future structured-entry content,
  // per Finding 2) — not document-by-document. REQUIREMENTS_MET both records the review and
  // closes the case in one action; REQUIREMENTS_INCOMPLETE just records the reason and leaves
  // the case in PENDING_QA_REVIEW (no "returned to nursing officer" state exists yet — the
  // 3-value status enum doesn't model one, and the build guide doesn't ask for it).
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
