import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { userHasRole, userHasPermission } from "../../lib/rbac.js";
import { ConflictError } from "../../lib/errors.js";
import { CountdownCaseRepository } from "./repository.js";
import { CountdownCase } from "./entities/CountdownCase.js";
import {
  TriageChecklistService, PrescriptionService, LabRequestService, LabResultService,
  ClinicalDecisionService, CountdownCaseService, ClinicalNoteService,
} from "./service.js";
// Cross-module read to check whether a result's patient is the caller's own record before falling back to staff grants.
import { PatientRepository } from "../patient/index.js";

const caseRepo = new CountdownCaseRepository();
const triageSvc = new TriageChecklistService();
const prescriptionSvc = new PrescriptionService();
const labRequestSvc = new LabRequestService();
const labResultSvc = new LabResultService();
const clinicalDecisionSvc = new ClinicalDecisionService();
const countdownCaseSvc = new CountdownCaseService();
const clinicalNoteSvc = new ClinicalNoteService();
const patientRepo = new PatientRepository();

// True when the patient record belongs to the caller.
async function callerOwnsPatient(callerId: string, patientId: string): Promise<boolean> {
  const patientRow = await patientRepo.findById(patientId);
  return !!patientRow?.userId && patientRow.userId === callerId;
}

// With patientId it's the patient's own countdown status; without it, the staff-wide listing.
export async function listCountdownCasesHandler(req: Request, res: Response) {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    const callerId = (req as AuthenticatedRequest).userId;

    if (patientId) {
      const isSelf = await callerOwnsPatient(callerId, patientId);
      if (!isSelf && !(await userHasPermission(callerId, "countdownCase", "read"))) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const rows = await caseRepo.findByPatient(patientId);
      res.json({ cases: rows.map((r) => new CountdownCase(r).toJSON()) });
      return;
    }

    // The staff-wide listing still needs the blanket permission, checked here since the route only requires authentication.
    if (!(await userHasPermission(callerId, "countdownCase", "read"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const rows = req.query.scope === "overview" ? await caseRepo.findForOverview() : await caseRepo.findActive();
    res.json({ cases: rows.map((r) => new CountdownCase(r).toJSON()) });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Completes the triage checklist for a patient.
export async function completeTriageChecklistHandler(req: Request, res: Response) {
  try {
    const completedBy = (req as AuthenticatedRequest).userId;
    const { conversationId, presentingComplaint, duration, functionalImpact, priorMeasures, canTalkWalkEat } = req.body;
    const result = await triageSvc.complete({
      conversationId, completedBy, presentingComplaint, duration, functionalImpact, priorMeasures, canTalkWalkEat,
    });
    res.status(201).json({ triageChecklist: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("already exists") ? 409 : 500;
    res.status(status).json({ error: message });
  }
}

// Returns a patient's triage checklist.
export async function getTriageChecklistHandler(req: Request, res: Response) {
  try {
    const result = await triageSvc.getByConversation(String(req.params.conversationId));
    if (!result) {
      res.status(404).json({ error: "No triage checklist for this conversation" });
      return;
    }
    res.json({ triageChecklist: result });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Creates a prescription.
export async function createPrescriptionHandler(req: Request, res: Response) {
  try {
    const doctorId = (req as AuthenticatedRequest).userId;
    const { patientId, appointmentId, triageChecklistId } = req.body;
    const result = await prescriptionSvc.create({ patientId, doctorId, appointmentId, triageChecklistId });
    res.status(201).json({ prescription: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("triage checklist") ? 422 : 500;
    res.status(status).json({ error: message });
  }
}

// Lists prescriptions.
export async function listPrescriptionsHandler(req: Request, res: Response) {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    if (!patientId) {
      res.status(400).json({ error: "patientId query parameter required" });
      return;
    }
    const result = await prescriptionSvc.listByPatient(patientId);
    res.json({ prescriptions: result });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Creates a lab request.
export async function createLabRequestHandler(req: Request, res: Response) {
  try {
    const requestedBy = (req as AuthenticatedRequest).userId;
    const { patientId } = req.body;
    const result = await labRequestSvc.create({ patientId, requestedBy });
    res.status(201).json({ labRequest: result });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Returns one lab request.
export async function getLabRequestHandler(req: Request, res: Response) {
  try {
    const result = await labRequestSvc.get(String(req.params.id));
    res.json({ labRequest: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(message === "Lab request not found" ? 404 : 500).json({ error: message });
  }
}

// Lists lab requests.
export async function listLabRequestsHandler(req: Request, res: Response) {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    if (!patientId) {
      res.status(400).json({ error: "patientId query parameter required" });
      return;
    }

    const callerId = (req as AuthenticatedRequest).userId;
    const isSelf = await callerOwnsPatient(callerId, patientId);
    if (!isSelf && !(await userHasPermission(callerId, "labRequest", "read"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const result = await labRequestSvc.listByPatient(patientId);
    res.json({ labRequests: result });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Marks a lab request as uploaded.
export async function markLabRequestUploadedHandler(req: Request, res: Response) {
  try {
    const result = await labRequestSvc.markUploaded(String(req.params.id));
    res.json({ labRequest: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message === "Lab request not found" ? 404 : message.startsWith("Cannot transition") ? 409 : 500;
    res.status(status).json({ error: message });
  }
}

// Marks a lab request as reviewed.
export async function markLabRequestReviewedHandler(req: Request, res: Response) {
  try {
    const result = await labRequestSvc.markReviewed(String(req.params.id));
    res.json({ labRequest: result });
  } catch (err) {
    // markReviewed can throw a real ConflictError from the virus-scan gate, so the class is checked instead of the message.
    if (err instanceof ConflictError) {
      res.status(409).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message === "Lab request not found" ? 404 : message.startsWith("Cannot transition") ? 409 : 500;
    res.status(status).json({ error: message });
  }
}

// Patients may self-upload the result against an existing lab request; staff uploading for them need labResult:create.
export async function uploadLabResultHandler(req: Request, res: Response) {
  try {
    const uploadedBy = (req as AuthenticatedRequest).userId;
    const { patientId, requestId, fileId, testDate, fileHash } = req.body;

    const isSelf = await callerOwnsPatient(uploadedBy, patientId);
    if (!isSelf && !(await userHasPermission(uploadedBy, "labResult", "create"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const result = await labResultSvc.upload({ patientId, requestId, uploadedBy, fileId, testDate, fileHash });
    res.status(201).json({ labResult: result });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Regional Admin always gets only the scoped {fileId, testDate, possibleDuplicate} view, whichever permission granted access.
export async function getLabResultHandler(req: Request, res: Response) {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const isAdmin = await userHasRole(userId, "REGIONAL_ADMIN");

    if (isAdmin) {
      const result = await labResultSvc.getForAdmin(String(req.params.id));
      res.json({ labResult: result });
      return;
    }

    // The own-record check runs after the fetch because it needs the result's patientId.
    const result = await labResultSvc.get(String(req.params.id));
    const isSelf = await callerOwnsPatient(userId, result.patientId);
    if (!isSelf && !(await userHasPermission(userId, "labResult", "read"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.json({ labResult: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(message === "Lab result not found" ? 404 : 500).json({ error: message });
  }
}

// Lists lab results.
export async function listLabResultsHandler(req: Request, res: Response) {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    if (!patientId) {
      res.status(400).json({ error: "patientId query parameter required" });
      return;
    }
    const userId = (req as AuthenticatedRequest).userId;
    const isAdmin = await userHasRole(userId, "REGIONAL_ADMIN");

    if (!isAdmin) {
      const isSelf = await callerOwnsPatient(userId, patientId);
      if (!isSelf && !(await userHasPermission(userId, "labResult", "read"))) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const result = isAdmin
      ? await labResultSvc.listByPatientForAdmin(patientId)
      : await labResultSvc.listByPatient(patientId);
    res.json({ labResults: result });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Maps a clinical decision error message to an HTTP status.
function clinicalDecisionErrorStatus(message: string): number {
  if (message === "Clinical decision not found") return 404;
  if (message.includes("already recorded") || message.includes("already exists")) return 409;
  if (message.includes("before QA has recorded")) return 422;
  return 500;
}

// Records the QA officer's recommendation on a result.
export async function recordQaRecommendationHandler(req: Request, res: Response) {
  try {
    const qaUserId = (req as AuthenticatedRequest).userId;
    const { recommendation, reason } = req.body;
    const result = await clinicalDecisionSvc.recordQaRecommendation(String(req.params.id), { recommendation, reason, qaUserId });
    res.json({ clinicalDecision: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(clinicalDecisionErrorStatus(message)).json({ error: message });
  }
}

// Records the final clinical decision.
export async function recordFinalDecisionHandler(req: Request, res: Response) {
  try {
    const directorUserId = (req as AuthenticatedRequest).userId;
    const { decision, reason } = req.body;
    const result = await clinicalDecisionSvc.recordFinalDecision(String(req.params.id), { decision, reason, directorUserId });
    res.json({ clinicalDecision: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(clinicalDecisionErrorStatus(message)).json({ error: message });
  }
}

// Returns a clinical decision.
export async function getClinicalDecisionHandler(req: Request, res: Response) {
  try {
    const result = await clinicalDecisionSvc.get(String(req.params.id));
    res.json({ clinicalDecision: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(message === "Clinical decision not found" ? 404 : 500).json({ error: message });
  }
}

// Sends lab results to QA for review.
export async function sendResultsToQaHandler(req: Request, res: Response) {
  try {
    const { countdownCaseId, labResultId } = req.body;
    const result = await countdownCaseSvc.sendResultsToQa(countdownCaseId, labResultId);
    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message === "Countdown case not found" ? 404 : message.includes("already exists") ? 409 : message.includes("Cannot") ? 422 : 500;
    res.status(status).json({ error: message });
  }
}

// Creates a clinical note.
export async function createClinicalNoteHandler(req: Request, res: Response) {
  try {
    const authorId = (req as AuthenticatedRequest).userId;
    const { patientId, note, recordType, sourceMeetingId } = req.body;
    const result = await clinicalNoteSvc.addNote({ patientId, authorId, note, recordType, sourceMeetingId });
    res.status(201).json(result);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Lists clinical notes.
export async function listClinicalNotesHandler(req: Request, res: Response) {
  try {
    const patientId = String(req.query.patientId);
    const notes = await clinicalNoteSvc.listForPatient(patientId);
    res.json({ notes });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Returns the clinical note for a meeting.
export async function getClinicalNoteByMeetingHandler(req: Request, res: Response) {
  try {
    const summary = await clinicalNoteSvc.getSummaryByMeeting(String(req.params.meetingId));
    res.json({ summary });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}
