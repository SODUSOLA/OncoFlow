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
import { notificationService } from "../notification/index.js";
// Cross-module read: the F4.6 virus-scan gate needs the File row's scan status, which this module doesn't own.
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

// One checklist per conversation ever; the Virtual Medical Officer restriction is enforced by route middleware.
export class TriageChecklistService {
  // Completes the triage checklist for a conversation, refusing a second one.
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

  // Returns the checklist for a conversation.
  async getByConversation(conversationId: string) {
    const row = await triageChecklistRepo.findByConversation(conversationId);
    return row ? new TriageChecklist(row).toJSON() : null;
  }
}

// triage_checklist_id is nullable in the schema but required in practice when the prescriber is a Virtual Medical Officer.
export class PrescriptionService {
  // A named, testable unit for the MO-triage invariant, which is the one most likely to silently regress.
  async assertTriageRequiredIfMO(doctorId: string, triageChecklistId: string | null | undefined): Promise<void> {
    const isMO = await userHasRole(doctorId, "VIRTUAL_MEDICAL_OFFICER");
    if (isMO && !triageChecklistId) {
      throw new Error("A Virtual Medical Officer must complete a triage checklist before prescribing");
    }
  }

  // Creates a prescription after applying the MO triage rule.
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

  // Lists a patient's prescriptions.
  async listByPatient(patientId: string) {
    const rows = await prescriptionRepo.findByPatient(patientId);
    return rows.map((r) => new Prescription(r).toJSON());
  }
}

// Simple CRUD modeled as an entity state machine (PENDING → UPLOADED → REVIEWED) for consistency.
export class LabRequestService {
  // Creates a PENDING lab request.
  async create(data: { patientId: string; requestedBy: string }) {
    const row = await labRequestRepo.create({
      id: crypto.randomUUID(),
      patientId: data.patientId,
      requestedBy: data.requestedBy,
      status: "PENDING",
    });
    return new LabRequest(row).toJSON();
  }

  // Returns a lab request or throws NotFoundError.
  async get(id: string) {
    const row = await labRequestRepo.findById(id);
    if (!row) throw new NotFoundError("Lab request not found");
    return new LabRequest(row).toJSON();
  }

  // Lists a patient's lab requests.
  async listByPatient(patientId: string) {
    const rows = await labRequestRepo.findByPatient(patientId);
    return rows.map((r) => new LabRequest(r).toJSON());
  }

  // Marks a lab request uploaded.
  async markUploaded(id: string) {
    const row = await labRequestRepo.findById(id);
    if (!row) throw new NotFoundError("Lab request not found");
    const updated = new LabRequest(row).markUploaded();
    const saved = await labRequestRepo.update(id, { status: updated.status });
    return new LabRequest(saved!).toJSON();
  }

  // Marks a lab request reviewed, refusing if any result's file isn't CLEAN.
  async markReviewed(id: string) {
    const row = await labRequestRepo.findById(id);
    if (!row) throw new NotFoundError("Lab request not found");

    // F4.6: every result tied to the request must have a CLEAN file, so an unscanned or infected upload can't be reviewed.
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

// F3.5: duplicate detection on upload and a hard split between the full clinical view and the Admin-scoped view.
export class LabResultService {
  // Stores a lab result, flags possible duplicates, and moves the request to UPLOADED.
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

    // Uploading a result also moves the request to UPLOADED, but only from PENDING, so a patient's self-upload isn't stranded.
    const requestRow = await labRequestRepo.findById(data.requestId);
    if (requestRow?.status === "PENDING") {
      const updated = new LabRequest(requestRow).markUploaded();
      await labRequestRepo.update(data.requestId, { status: updated.status });
    }

    return new LabResult(row).toJSON();
  }

  // The scan status is derived here because the entity doesn't know about File; it defaults to PENDING if the file row is missing.
  private async fileStatus(fileId: string): Promise<"PENDING" | "CLEAN" | "INFECTED"> {
    const fileRow = await fileRepo.findById(fileId);
    return fileRow?.virusScanStatus ?? "PENDING";
  }

  // Returns the full clinical view of a lab result.
  async get(id: string) {
    const row = await labResultRepo.findById(id);
    if (!row) throw new NotFoundError("Lab result not found");
    return { ...new LabResult(row).toJSON(), fileStatus: await this.fileStatus(row.fileId) };
  }

  // Returns the Admin-scoped view of a lab result.
  async getForAdmin(id: string) {
    const row = await labResultRepo.findById(id);
    if (!row) throw new NotFoundError("Lab result not found");
    return { ...new LabResult(row).toAdminJSON(), fileStatus: await this.fileStatus(row.fileId) };
  }

  // Lists a patient's lab results in the full clinical view.
  async listByPatient(patientId: string) {
    const rows = await labResultRepo.findByPatient(patientId);
    return Promise.all(rows.map(async (r) => ({ ...new LabResult(r).toJSON(), fileStatus: await this.fileStatus(r.fileId) })));
  }

  // Lists a patient's lab results in the Admin-scoped view.
  async listByPatientForAdmin(patientId: string) {
    const rows = await labResultRepo.findByPatient(patientId);
    return Promise.all(rows.map(async (r) => ({ ...new LabResult(r).toAdminJSON(), fileStatus: await this.fileStatus(r.fileId) })));
  }
}

// The two-stage sequencing guard lives on the entity; this service only persists and re-throws so no path can bypass it.
export class ClinicalDecisionService {
  // Returns a clinical decision.
  async get(id: string) {
    const row = await clinicalDecisionRepo.findById(id);
    if (!row) throw new NotFoundError("Clinical decision not found");
    return new ClinicalDecision(row).toJSON();
  }

  // Returns the decision for a lab result.
  async getByLabResult(labResultId: string) {
    const row = await clinicalDecisionRepo.findByLabResult(labResultId);
    return row ? new ClinicalDecision(row).toJSON() : null;
  }

  // Records the QA recommendation (stage 1).
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

  // Records the director's final decision (stage 2).
  async recordFinalDecision(id: string, data: { decision: "APPROVED" | "DECLINED" | "REQUIRES_REVIEW"; reason?: string; directorUserId: string }) {
    const row = await clinicalDecisionRepo.findById(id);
    if (!row) throw new NotFoundError("Clinical decision not found");
    // The sequencing guard fires inside this call; it isn't a duplicate check, just where the entity's error surfaces.
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

// Orchestrates the countdown case's state transitions and, on sending results to QA, creates the ClinicalDecision row for QA.
export class CountdownCaseService {
  // A manual nudge from the Regional Admin: tells the patient's facility QA officers the case needs attention.
  // Leaves the case itself untouched — the state machine alone moves it to ESCALATED at Day 0.
  async escalate(id: string, facilityId: string) {
    const row = await countdownCaseRepo.findById(id);
    if (!row) throw new NotFoundError("Countdown case not found");
    if (row.status !== "ACTIVE" && row.status !== "ESCALATED") throw new ConflictError("Only an open countdown case can be escalated");
    const recipients = await countdownCaseRepo.findQaOfficerIdsForFacility(facilityId);
    await Promise.all(recipients.map((recipientId) => notificationService.create({ recipientId, type: "COUNTDOWN_ESCALATION" }).catch(() => {})));
    return { notified: recipients.length };
  }

  // Records that labs were prompted.
  async labsPrompted(id: string) {
    const row = await countdownCaseRepo.findById(id);
    if (!row) throw new NotFoundError("Countdown case not found");
    const updated = new CountdownCase(row).labsPrompted();
    const saved = await countdownCaseRepo.update(id, { labsPromptedAt: updated.labsPromptedAt });
    return new CountdownCase(saved!).toJSON();
  }

  // Records that labs were uploaded.
  async labsUploaded(id: string) {
    const row = await countdownCaseRepo.findById(id);
    if (!row) throw new NotFoundError("Countdown case not found");
    const updated = new CountdownCase(row).labsUploaded();
    const saved = await countdownCaseRepo.update(id, { labsUploadedAt: updated.labsUploadedAt });
    return new CountdownCase(saved!).toJSON();
  }

  // Sends a lab result to QA and creates its ClinicalDecision.
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

  // Records payment confirmation on a countdown case.
  async paymentConfirmed(id: string) {
    const row = await countdownCaseRepo.findById(id);
    if (!row) throw new NotFoundError("Countdown case not found");
    const updated = new CountdownCase(row).paymentConfirmed();
    const saved = await countdownCaseRepo.update(id, { paymentConfirmedAt: updated.paymentConfirmedAt, status: updated.status });
    return new CountdownCase(saved!).toJSON();
  }
}

// Backs the Add Clinical Note action with a plain create and list, since a note has no state transitions.
export class ClinicalNoteService {
  // recordType defaults to the free-text note; sourceMeetingId is set only by "Sync to EHR & Finalize" and makes that write idempotent-checkable.
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

  // Lists a patient's clinical notes.
  async listForPatient(patientId: string) {
    return clinicalNoteRepo.findByPatient(patientId);
  }

  // Post-call Summary checks this on mount to know if it's finalized; notes have no update path, so existing means locked.
  async getSummaryByMeeting(meetingId: string) {
    return clinicalNoteRepo.findByMeeting(meetingId);
  }
}
