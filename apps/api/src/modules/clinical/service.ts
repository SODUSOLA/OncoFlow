import crypto from "node:crypto";
import {
  TriageChecklistRepository, PrescriptionRepository, LabRequestRepository, LabResultRepository,
  ClinicalDecisionRepository, CountdownCaseRepository, MedicalRecordRepository, ClinicalNoteRepository,
} from "./repository.js";
import { TriageChecklist } from "./entities/TriageChecklist.js";
import { Prescription } from "./entities/Prescription.js";
import { LabRequest } from "./entities/LabRequest.js";
import { LabResult } from "./entities/LabResult.js";
import { ClinicalDecision } from "./entities/ClinicalDecision.js";
import { CountdownCase } from "./entities/CountdownCase.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { userHasRole } from "../../lib/rbac.js";
// Cross-module read (same pattern as billing/appointment's PatientRepository imports) — the
// F4.6 virus-scan gate needs the File row's virusScanStatus, which this module doesn't own.
import { FileRepository } from "../documents/index.js";

const fileRepo = new FileRepository();
const triageChecklistRepo = new TriageChecklistRepository();
const prescriptionRepo = new PrescriptionRepository();
const labRequestRepo = new LabRequestRepository();
const labResultRepo = new LabResultRepository();
const clinicalDecisionRepo = new ClinicalDecisionRepository();
const countdownCaseRepo = new CountdownCaseRepository();
const medicalRecordRepo = new MedicalRecordRepository();
const clinicalNoteRepo = new ClinicalNoteRepository();

// F3.2 — one checklist per conversation, ever. The role restriction (must be a Virtual
// Medical Officer) is enforced at the route layer via requireRole("VIRTUAL_MEDICAL_OFFICER"),
// consistent with how every other role-specific gate in this codebase lives in middleware,
// not duplicated here.
export class TriageChecklistService {
  async complete(data: {
    conversationId: string;
    completedBy: string;
    presentingComplaint: string;
    duration: string;
    functionalImpact: string;
    priorMeasures: string;
    canTalkWalkEat: string;
  }) {
    const existing = await triageChecklistRepo.findByConversation(data.conversationId);
    if (existing) {
      throw new ConflictError("A triage checklist already exists for this conversation");
    }

    const row = await triageChecklistRepo.create({
      id: crypto.randomUUID(),
      conversationId: data.conversationId,
      completedBy: data.completedBy,
      completedAt: new Date(),
      presentingComplaint: data.presentingComplaint,
      duration: data.duration,
      functionalImpact: data.functionalImpact,
      priorMeasures: data.priorMeasures,
      canTalkWalkEat: data.canTalkWalkEat,
    });

    return new TriageChecklist(row).toJSON();
  }

  async getByConversation(conversationId: string) {
    const row = await triageChecklistRepo.findByConversation(conversationId);
    return row ? new TriageChecklist(row).toJSON() : null;
  }
}

// F3.3 — triage_checklist_id is nullable at the schema level (a Consulting Oncologist
// prescribing mid-consult has no triage checklist at all), but must be NOT NULL in practice
// whenever the prescriber is specifically a Virtual Medical Officer.
export class PrescriptionService {
  // Named per the build plan (F3.3) rather than an inline if in create() — this is the one
  // invariant most likely to silently regress later if it isn't its own testable unit.
  async assertTriageRequiredIfMO(doctorId: string, triageChecklistId: string | null | undefined): Promise<void> {
    const isMO = await userHasRole(doctorId, "VIRTUAL_MEDICAL_OFFICER");
    if (isMO && !triageChecklistId) {
      throw new Error("A Virtual Medical Officer must complete a triage checklist before prescribing");
    }
  }

  async create(data: {
    patientId: string;
    doctorId: string;
    appointmentId?: string;
    triageChecklistId?: string;
  }) {
    await this.assertTriageRequiredIfMO(data.doctorId, data.triageChecklistId);

    const row = await prescriptionRepo.create({
      id: crypto.randomUUID(),
      patientId: data.patientId,
      doctorId: data.doctorId,
      appointmentId: data.appointmentId ?? null,
      triageChecklistId: data.triageChecklistId ?? null,
      status: "ACTIVE",
    });

    return new Prescription(row).toJSON();
  }

  async listByPatient(patientId: string) {
    const rows = await prescriptionRepo.findByPatient(patientId);
    return rows.map((r) => new Prescription(r).toJSON());
  }
}

// F3.4 — straightforward CRUD, but modeled as an entity-level state machine (PENDING →
// UPLOADED → REVIEWED) for consistency with the rest of the codebase even though it's simple.
export class LabRequestService {
  async create(data: { patientId: string; requestedBy: string }) {
    const row = await labRequestRepo.create({
      id: crypto.randomUUID(),
      patientId: data.patientId,
      requestedBy: data.requestedBy,
      status: "PENDING",
    });
    return new LabRequest(row).toJSON();
  }

  async get(id: string) {
    const row = await labRequestRepo.findById(id);
    if (!row) throw new NotFoundError("Lab request not found");
    return new LabRequest(row).toJSON();
  }

  async listByPatient(patientId: string) {
    const rows = await labRequestRepo.findByPatient(patientId);
    return rows.map((r) => new LabRequest(r).toJSON());
  }

  async markUploaded(id: string) {
    const row = await labRequestRepo.findById(id);
    if (!row) throw new NotFoundError("Lab request not found");
    const updated = new LabRequest(row).markUploaded();
    const saved = await labRequestRepo.update(id, { status: updated.status });
    return new LabRequest(saved!).toJSON();
  }

  async markReviewed(id: string) {
    const row = await labRequestRepo.findById(id);
    if (!row) throw new NotFoundError("Lab request not found");

    // F4.6: a lab result whose file hasn't come back CLEAN yet (still scanning, or flagged
    // INFECTED) can't be reviewed — per spec, nothing downstream should treat an unscanned
    // upload as usable. Checks every result tied to this request (a request can have more
    // than one submission), not just the latest.
    const results = await labResultRepo.findByRequest(id);
    for (const result of results) {
      const fileRow = await fileRepo.findById(result.fileId);
      if (fileRow?.virusScanStatus !== "CLEAN") {
        throw new ConflictError("Cannot review a lab result whose file is not yet scanned clean");
      }
    }

    const updated = new LabRequest(row).markReviewed();
    const saved = await labRequestRepo.update(id, { status: updated.status });
    return new LabRequest(saved!).toJSON();
  }
}

// F3.5 — duplicate detection on upload (same patient, same file hash), and a hard split
// between the full clinical view and the Admin-scoped view (never the same serializer with
// a "hide some fields" flag — see LabResult.toAdminJSON()).
export class LabResultService {
  async upload(data: {
    patientId: string;
    requestId: string;
    uploadedBy: string;
    fileId: string;
    testDate: string;
    fileHash: string;
  }) {
    const existingMatches = await labResultRepo.findByHashAndPatient(data.fileHash, data.patientId);

    const row = await labResultRepo.create({
      id: crypto.randomUUID(),
      patientId: data.patientId,
      requestId: data.requestId,
      uploadedBy: data.uploadedBy,
      status: "PENDING",
      fileId: data.fileId,
      testDate: data.testDate,
      fileHash: data.fileHash,
      possibleDuplicate: existingMatches.length > 0,
    });

    // Uploading a result IS the request becoming "uploaded" — no separate manual staff step
    // needed for this to happen (that would otherwise strand a patient's own self-upload in
    // PENDING forever, since mark-uploaded stays a staff-permission-gated action). Only fires
    // from PENDING — a second/duplicate result against an already-UPLOADED request doesn't
    // re-trigger the transition (LabRequest.markUploaded() would just throw).
    const requestRow = await labRequestRepo.findById(data.requestId);
    if (requestRow?.status === "PENDING") {
      const updated = new LabRequest(requestRow).markUploaded();
      await labRequestRepo.update(data.requestId, { status: updated.status });
    }

    return new LabResult(row).toJSON();
  }

  // Derived, not stored on LabResult itself — the entity has no knowledge of File (cross-
  // module concern), so this merges it in at the service layer rather than teaching the
  // entity about a table it doesn't own. Defaults to "PENDING" if the file row is somehow
  // missing rather than throwing, since this is read-path enrichment, not a hard dependency.
  private async fileStatus(fileId: string): Promise<"PENDING" | "CLEAN" | "INFECTED"> {
    const fileRow = await fileRepo.findById(fileId);
    return fileRow?.virusScanStatus ?? "PENDING";
  }

  async get(id: string) {
    const row = await labResultRepo.findById(id);
    if (!row) throw new NotFoundError("Lab result not found");
    return { ...new LabResult(row).toJSON(), fileStatus: await this.fileStatus(row.fileId) };
  }

  async getForAdmin(id: string) {
    const row = await labResultRepo.findById(id);
    if (!row) throw new NotFoundError("Lab result not found");
    return { ...new LabResult(row).toAdminJSON(), fileStatus: await this.fileStatus(row.fileId) };
  }

  async listByPatient(patientId: string) {
    const rows = await labResultRepo.findByPatient(patientId);
    return Promise.all(rows.map(async (r) => ({ ...new LabResult(r).toJSON(), fileStatus: await this.fileStatus(r.fileId) })));
  }

  async listByPatientForAdmin(patientId: string) {
    const rows = await labResultRepo.findByPatient(patientId);
    return Promise.all(rows.map(async (r) => ({ ...new LabResult(r).toAdminJSON(), fileStatus: await this.fileStatus(r.fileId) })));
  }
}

// F3.6 — the two-stage sequencing guard lives on the entity (ClinicalDecision.recordFinalDecision);
// this service just orchestrates persistence and re-throws whatever the entity enforces, so the
// invariant can never be bypassed by a service method that forgets to check.
export class ClinicalDecisionService {
  async get(id: string) {
    const row = await clinicalDecisionRepo.findById(id);
    if (!row) throw new NotFoundError("Clinical decision not found");
    return new ClinicalDecision(row).toJSON();
  }

  async getByLabResult(labResultId: string) {
    const row = await clinicalDecisionRepo.findByLabResult(labResultId);
    return row ? new ClinicalDecision(row).toJSON() : null;
  }

  async recordQaRecommendation(id: string, data: { recommendation: "APPROVED" | "DECLINED" | "REQUIRES_REVIEW"; reason?: string; qaUserId: string }) {
    const row = await clinicalDecisionRepo.findById(id);
    if (!row) throw new NotFoundError("Clinical decision not found");
    const updated = new ClinicalDecision(row).recordQaRecommendation(data.recommendation, data.reason ?? null, data.qaUserId);
    const saved = await clinicalDecisionRepo.update(id, {
      qaRecommendation: updated.qaRecommendation,
      qaReason: updated.qaReason,
      qaDecidedBy: updated.qaDecidedBy,
      qaDecidedAt: updated.qaDecidedAt,
    });
    return new ClinicalDecision(saved!).toJSON();
  }

  async recordFinalDecision(id: string, data: { decision: "APPROVED" | "DECLINED" | "REQUIRES_REVIEW"; reason?: string; directorUserId: string }) {
    const row = await clinicalDecisionRepo.findById(id);
    if (!row) throw new NotFoundError("Clinical decision not found");
    // The actual guard (qa_decided_at IS NULL -> reject) fires inside this call — this is not
    // a duplicate check, just where the entity's thrown error surfaces to the caller.
    const updated = new ClinicalDecision(row).recordFinalDecision(data.decision, data.reason ?? null, data.directorUserId);
    const saved = await clinicalDecisionRepo.update(id, {
      finalDecision: updated.finalDecision,
      finalReason: updated.finalReason,
      directorId: updated.directorId,
      directorDecidedAt: updated.directorDecidedAt,
    });
    return new ClinicalDecision(saved!).toJSON();
  }
}

// Orchestrates CountdownCase's own state-machine entity methods (previously unwired to any
// service/route — the transitions existed but were unreachable) plus, for resultsSentToQa
// specifically, the F3.6 linkage: reaching that state must produce a ClinicalDecision row for
// QA to act on, not just a timestamp with nothing downstream.
export class CountdownCaseService {
  async labsPrompted(id: string) {
    const row = await countdownCaseRepo.findById(id);
    if (!row) throw new NotFoundError("Countdown case not found");
    const updated = new CountdownCase(row).labsPrompted();
    const saved = await countdownCaseRepo.update(id, { labsPromptedAt: updated.labsPromptedAt });
    return new CountdownCase(saved!).toJSON();
  }

  async labsUploaded(id: string) {
    const row = await countdownCaseRepo.findById(id);
    if (!row) throw new NotFoundError("Countdown case not found");
    const updated = new CountdownCase(row).labsUploaded();
    const saved = await countdownCaseRepo.update(id, { labsUploadedAt: updated.labsUploadedAt });
    return new CountdownCase(saved!).toJSON();
  }

  async sendResultsToQa(countdownCaseId: string, labResultId: string) {
    const row = await countdownCaseRepo.findById(countdownCaseId);
    if (!row) throw new NotFoundError("Countdown case not found");

    const existingDecision = await clinicalDecisionRepo.findByLabResult(labResultId);
    if (existingDecision) {
      throw new ConflictError("A clinical decision already exists for this lab result");
    }

    const updated = new CountdownCase(row).resultsSentToQa();
    const savedCase = await countdownCaseRepo.update(countdownCaseId, { resultsSentToQaAt: updated.resultsSentToQaAt });

    const decisionRow = await clinicalDecisionRepo.create({
      id: crypto.randomUUID(),
      labResultId,
    });

    return {
      countdownCase: new CountdownCase(savedCase!).toJSON(),
      clinicalDecision: new ClinicalDecision(decisionRow).toJSON(),
    };
  }

  async paymentConfirmed(id: string) {
    const row = await countdownCaseRepo.findById(id);
    if (!row) throw new NotFoundError("Countdown case not found");
    const updated = new CountdownCase(row).paymentConfirmed();
    const saved = await countdownCaseRepo.update(id, { paymentConfirmedAt: updated.paymentConfirmedAt, status: updated.status });
    return new CountdownCase(saved!).toJSON();
  }
}

// Backs the "Add Clinical Note" action present on every Consulting Oncologist screen — the
// schema (MedicalRecord/ClinicalNote) already existed, but no route ever exposed writing to
// it. A plain create+list pair, no entity/status-machine wrapper: unlike TriageChecklist or
// CountdownCase, a clinical note has no state transitions to model.
export class ClinicalNoteService {
  // recordType defaults to the original free-text "Add Clinical Note" action's type.
  // sourceMeetingId is only ever set for Phase 6's "Sync to EHR & Finalize" — it's what makes
  // that write idempotent-checkable (getSummaryByMeeting) and is otherwise omitted.
  async addNote(data: { patientId: string; authorId: string; note: string; recordType?: string; sourceMeetingId?: string }) {
    const record = await medicalRecordRepo.create({
      id: crypto.randomUUID(),
      patientId: data.patientId,
      createdBy: data.authorId,
      recordType: data.recordType ?? "CONSULT_NOTE",
      summary: data.note.slice(0, 200),
      sourceMeetingId: data.sourceMeetingId,
    });
    const note = await clinicalNoteRepo.create({
      id: crypto.randomUUID(),
      medicalRecordId: record.id,
      authorId: data.authorId,
      note: data.note,
    });
    return { id: note.id, patientId: data.patientId, note: note.note, authorId: note.authorId, createdAt: note.createdAt };
  }

  async listForPatient(patientId: string) {
    return clinicalNoteRepo.findByPatient(patientId);
  }

  // Post-call Summary reads this on mount to know whether it's already been finalized (survives
  // reload — a real state transition, not just local component state) — see ClinicalNote has no
  // update path, so "exists" IS "locked".
  async getSummaryByMeeting(meetingId: string) {
    return clinicalNoteRepo.findByMeeting(meetingId);
  }
}
