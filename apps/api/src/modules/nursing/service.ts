import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  NursingCaseRepository, NursingCaseReviewRepository, NursingDocumentationSheetRepository, UploadSecurityIncidentRepository,
  IdentityMismatchReportRepository, CaseMetricsRepository,
} from "./repository.js";
import { FileRepository } from "../documents/index.js";
import { PatientRepository } from "../patient/index.js";
import { FacilityRepository } from "../facility/index.js";
import { RegimenService } from "../clinical-metrics/index.js";
import { notificationService } from "../notification/index.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { isCaseEditable, CASE_LOCKED_MESSAGE } from "./editability.js";
import { reviewerFacilityId, reviewerMayAccess, OUT_OF_SCOPE_MESSAGE } from "./reviewerScope.js";

const caseRepo = new NursingCaseRepository();
const reviewRepo = new NursingCaseReviewRepository();
const sheetRepo = new NursingDocumentationSheetRepository();
const incidentRepo = new UploadSecurityIncidentRepository();
const mismatchRepo = new IdentityMismatchReportRepository();
const caseMetricsRepo = new CaseMetricsRepository();
const fileRepo = new FileRepository();
const patientRepo = new PatientRepository();
const facilityRepo = new FacilityRepository();
const regimenSvc = new RegimenService();

// A staff member's display name — full name if one's on record, otherwise their email's local part
// (matches User.fullName, but this is a raw SQL row, not a User entity).
function staffFullName(row: { email: string; firstName: string | null; lastName: string | null } | null): string | null {
  if (!row) return null;
  if (row.firstName || row.lastName) return [row.firstName, row.lastName].filter(Boolean).join(" ");
  return row.email.split("@")[0]!;
}

// Generates a display reference such as "#8842-X" for a security incident.
function generateIncidentReference(): string {
  // Four random digits plus a fixed "-X" suffix matching the design; only displayed, so collisions don't matter.
  const digits = crypto.randomInt(1000, 10000);
  return `#${digits}-X`;
}

// QA officers are registered to a facility and review only its cases, so only that facility's QA officers hear
// about a submission (an unscoped QA account — no facility — hears about all of them).
async function notifyQaOfSubmission(patientFacilityId: string): Promise<void> {
  const rows = await db.execute<{ id: string }>(sql`
    SELECT u.id FROM "user" u
    JOIN user_role ur ON ur.user_id = u.id
    JOIN role r ON r.id = ur.role_id
    WHERE r.name::text = 'QUALITY_ASSURANCE_OFFICER' AND (u.facility_id = ${patientFacilityId} OR u.facility_id IS NULL)
  `);
  await Promise.all(rows.map((r) => notificationService.create({ recipientId: r.id, type: "NURSING_CASE_SUBMITTED" }).catch(() => {})));
}

// Regional Admins in the patient's facility's region are told when a nurse reports an identity mismatch.
async function notifyAdminsOfMismatch(patientFacilityId: string): Promise<void> {
  const rows = await db.execute<{ id: string }>(sql`
    SELECT u.id FROM "user" u
    JOIN user_role ur ON ur.user_id = u.id
    JOIN role r ON r.id = ur.role_id
    JOIN facility uf ON uf.id = u.facility_id
    WHERE r.name::text = 'REGIONAL_ADMIN'
      AND uf.region = (SELECT region FROM facility WHERE id = ${patientFacilityId})
  `);
  await Promise.all(rows.map((r) => notificationService.create({ recipientId: r.id, type: "IDENTITY_MISMATCH_REPORTED" }).catch(() => {})));
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
    return { ...row, documentationSheet: sheet, reviews, editable: await isCaseEditable(id) };
  }

  // Lists cases started by the nurse.
  async listMine(startedBy: string) {
    return caseRepo.findByStartedBy(startedBy);
  }

  // The patient folder's case history: every visitation on record for this patient, regardless of who
  // started it — gated at the route on patient:read, since seeing a patient's treatment history is a right
  // that comes with legitimate clinical access to the patient, not with having started this particular case.
  async listByPatient(patientId: string) {
    return caseRepo.findByPatient(patientId);
  }

  // Lists cases awaiting QA review.
  async listPendingReview(reviewerId: string) {
    return caseRepo.findPendingReview(await reviewerFacilityId(reviewerId));
  }

  // Records that the patient in front of the nurse doesn't match the profile on file, and tells Regional Admin.
  async reportIdentityMismatch(caseId: string, callerId: string, note?: string) {
    const caseRow = await caseRepo.findById(caseId);
    if (!caseRow) throw new NotFoundError("Nursing case not found");
    if (caseRow.startedBy !== callerId) throw new ForbiddenError("You can only report on your own case");
    if (caseRow.status === "CLOSED") throw new ConflictError("This case is already closed");
    const report = await mismatchRepo.create({ id: crypto.randomUUID(), nursingCaseId: caseId, reportedBy: callerId, note: note?.trim() || null });
    const patientRow = await patientRepo.findById(caseRow.patientId);
    if (patientRow) await notifyAdminsOfMismatch(patientRow.facilityId);
    return report;
  }

  // Whether a reviewer (QA) may see this case — their facility's cases only.
  async reviewerMayAccessCase(reviewerId: string, patientFacilityId: string) {
    return reviewerMayAccess(reviewerId, patientFacilityId);
  }

  // The nurse confirming the patient in front of them matches the profile photo on file. Stored on the case,
  // so leaving and resuming documentation never repeats it; idempotent for the same reason.
  async verifyIdentity(caseId: string, callerId: string) {
    const caseRow = await caseRepo.findById(caseId);
    if (!caseRow) throw new NotFoundError("Nursing case not found");
    if (caseRow.startedBy !== callerId) throw new ForbiddenError("You can only verify identity on your own case");
    if (caseRow.status === "CLOSED") throw new ConflictError("This case is already closed");
    if (!(await isCaseEditable(caseId))) throw new ConflictError(CASE_LOCKED_MESSAGE);
    if (caseRow.identityVerifiedAt) return caseRow;
    return (await caseRepo.update(caseId, { identityVerifiedAt: new Date() }))!;
  }

  // Steps 3-5 collapse into one call once identity is verified and the documentation form is filled in,
  // moving the case out of STARTED. Also reachable while PENDING_QA_REVIEW, so a nurse can amend and
  // resubmit after QA sends a case back with REQUIREMENTS_INCOMPLETE — the sheet is updated in place
  // (one per case) rather than piling up a second row, and QA is notified again either way.
  async submitDocumentationSheet(
    caseId: string, callerId: string,
    data: {
      fileReference?: string;
      treatmentDate?: string;
      infusionStartTime?: string; infusionEndTime?: string; note?: string; nextAppointmentDate?: string;
    },
  ) {
    const caseRow = await caseRepo.findById(caseId);
    if (!caseRow) throw new NotFoundError("Nursing case not found");
    if (caseRow.startedBy !== callerId) throw new ForbiddenError("You can only document your own case");
    if (caseRow.status === "CLOSED") throw new ConflictError("This case is already closed");
    // Submitted and waiting on QA: frozen, so what QA is reviewing can't shift under them. A resubmission is
    // only possible after QA sends it back, and freezes it again.
    if (!(await isCaseEditable(caseId))) throw new ConflictError(CASE_LOCKED_MESSAGE);

    // Identity has to have been confirmed on this case first — the client's step order is backstopped here.
    if (!caseRow.identityVerifiedAt) throw new ConflictError("Verify the patient's identity before submitting documentation");

    // A legacy file upload, only if one was carried over from before the structured form, must exist and be CLEAN.
    for (const fileId of [data.fileReference].filter((v): v is string => !!v)) {
      const fileRow = await fileRepo.findById(fileId);
      if (!fileRow) throw new NotFoundError(`Referenced file ${fileId} not found`);
      if (fileRow.uploadedBy !== callerId) throw new ForbiddenError("Referenced file was not uploaded by you");
      if (fileRow.virusScanStatus !== "CLEAN") throw new ConflictError(`File ${fileId} has not cleared the safety scan (status: ${fileRow.virusScanStatus})`);
    }

    // "Managing Consultant" is the QA officer assigned to this patient's hospital (by full name, not
    // anything the nurse types), resolved from the patient's facility so it can never disagree with who
    // actually reviews the case. "Diagnosis" is likewise not typed here — it's whatever the prescribing
    // consultant stated on this cycle's regimen. Both are left null if there's nothing on record.
    const patientRow = await patientRepo.findById(caseRow.patientId);
    const qaOfficer = patientRow ? await facilityRepo.findQaOfficer(patientRow.facilityId) : null;
    const diagnosis = await regimenSvc.getDiagnosisForCycle(caseRow.regimenCycleId);

    // Completeness, enforced here so nothing downstream (CrCl/eGFR, the case lock) rests on a half-filled form:
    // a treatment date, sane infusion times, and biometrics + labs (weight, height, creatinine — the snapshot
    // can't exist without them) recorded for this visitation since the case opened or QA last sent it back.
    if (!data.treatmentDate) throw new ConflictError("A treatment date is required");
    if ((data.infusionStartTime && !data.infusionEndTime) || (!data.infusionStartTime && data.infusionEndTime)) {
      throw new ConflictError("Enter both infusion start and end times, or neither");
    }
    if (data.infusionStartTime && data.infusionEndTime && data.infusionEndTime.slice(0, 5) <= data.infusionStartTime.slice(0, 5)) {
      throw new ConflictError("Infusion end must be after infusion start");
    }
    const [latestReview] = await reviewRepo.findByCase(caseId);
    const since = latestReview && latestReview.reviewedAt > caseRow.startedAt ? latestReview.reviewedAt : caseRow.startedAt;
    if (!(await caseMetricsRepo.findSnapshotSince(caseRow.regimenCycleId, since))) {
      throw new ConflictError("Record weight, height and creatinine (biometrics and labs) before submitting the documentation");
    }

    const content = {
      upiCodeEntered: patientRow?.uniquePatientId ?? "", idPhotoFileId: null, identityVerifiedAt: caseRow.identityVerifiedAt,
      fileReference: data.fileReference ?? null,
      diagnosis, managingConsultant: staffFullName(qaOfficer),
      treatmentDate: data.treatmentDate ?? null, infusionStartTime: data.infusionStartTime ?? null,
      infusionEndTime: data.infusionEndTime ?? null, note: data.note?.trim() || null,
      nextAppointmentDate: data.nextAppointmentDate ?? null,
    };
    const existing = await sheetRepo.findByCase(caseId);
    const sheet = existing
      ? (await sheetRepo.update(existing.id, content))!
      : await sheetRepo.create({ id: crypto.randomUUID(), nursingCaseId: caseId, authoredBy: callerId, ...content });

    const updated = caseRow.status === "STARTED"
      ? (await caseRepo.update(caseId, { status: "PENDING_QA_REVIEW" }))!
      : caseRow;
    await notifyQaOfSubmission(patientRow?.facilityId ?? "");
    return { case: updated, documentationSheet: sheet };
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
    // A QA officer reviews only their own facility's cases.
    const reviewedPatient = await patientRepo.findById(caseRow.patientId);
    if (reviewedPatient && !(await reviewerMayAccess(reviewedBy, reviewedPatient.facilityId))) throw new ForbiddenError(OUT_OF_SCOPE_MESSAGE);

    const review = await reviewRepo.create({
      id: crypto.randomUUID(), nursingCaseId: caseId, reviewedBy, decision, reason: reason ?? null,
    });

    let updatedCase = caseRow;
    if (decision === "REQUIREMENTS_MET") {
      updatedCase = (await caseRepo.update(caseId, { status: "CLOSED", closedBy: reviewedBy, closedAt: new Date() }))!;
      // The visitation is done, so its cycle leaves the nurse's Schedule (which lists only SCHEDULED cycles).
      await regimenSvc.completeCycle(caseRow.regimenCycleId, caseRow.startedBy);
    }
    // Either decision is news the nurse needs: closed means done, incomplete means there's more to fix.
    await notificationService.create({ recipientId: caseRow.startedBy, type: "NURSING_CASE_REVIEWED" }).catch(() => {});
    return { case: updatedCase, review };
  }
}

export const nursingCaseService = new NursingCaseService();
