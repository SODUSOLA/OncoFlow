import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { userHasRole } from "../../lib/rbac.js";
import { CountdownCaseRepository } from "./repository.js";
import { CountdownCase } from "./entities/CountdownCase.js";
import {
  TriageChecklistService, PrescriptionService, LabRequestService, LabResultService,
  ClinicalDecisionService, CountdownCaseService,
} from "./service.js";

const caseRepo = new CountdownCaseRepository();
const triageSvc = new TriageChecklistService();
const prescriptionSvc = new PrescriptionService();
const labRequestSvc = new LabRequestService();
const labResultSvc = new LabResultService();
const clinicalDecisionSvc = new ClinicalDecisionService();
const countdownCaseSvc = new CountdownCaseService();

export async function listCountdownCasesHandler(_req: Request, res: Response) {
  try {
    const rows = await caseRepo.findActive();
    res.json({ cases: rows.map((r) => new CountdownCase(r).toJSON()) });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

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

export async function getLabRequestHandler(req: Request, res: Response) {
  try {
    const result = await labRequestSvc.get(String(req.params.id));
    res.json({ labRequest: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(message === "Lab request not found" ? 404 : 500).json({ error: message });
  }
}

export async function listLabRequestsHandler(req: Request, res: Response) {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    if (!patientId) {
      res.status(400).json({ error: "patientId query parameter required" });
      return;
    }
    const result = await labRequestSvc.listByPatient(patientId);
    res.json({ labRequests: result });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

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

export async function markLabRequestReviewedHandler(req: Request, res: Response) {
  try {
    const result = await labRequestSvc.markReviewed(String(req.params.id));
    res.json({ labRequest: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message === "Lab request not found" ? 404 : message.startsWith("Cannot transition") ? 409 : 500;
    res.status(status).json({ error: message });
  }
}

export async function uploadLabResultHandler(req: Request, res: Response) {
  try {
    const uploadedBy = (req as AuthenticatedRequest).userId;
    const { patientId, requestId, fileId, testDate, fileHash } = req.body;
    const result = await labResultSvc.upload({ patientId, requestId, uploadedBy, fileId, testDate, fileHash });
    res.status(201).json({ labResult: result });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// F3.5: Regional Admin always gets the scoped {fileId, testDate, possibleDuplicate} view —
// never the full clinical record — regardless of which permission let them reach this route.
export async function getLabResultHandler(req: Request, res: Response) {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const isAdmin = await userHasRole(userId, "REGIONAL_ADMIN");
    const result = isAdmin
      ? await labResultSvc.getForAdmin(String(req.params.id))
      : await labResultSvc.get(String(req.params.id));
    res.json({ labResult: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(message === "Lab result not found" ? 404 : 500).json({ error: message });
  }
}

export async function listLabResultsHandler(req: Request, res: Response) {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    if (!patientId) {
      res.status(400).json({ error: "patientId query parameter required" });
      return;
    }
    const userId = (req as AuthenticatedRequest).userId;
    const isAdmin = await userHasRole(userId, "REGIONAL_ADMIN");
    const result = isAdmin
      ? await labResultSvc.listByPatientForAdmin(patientId)
      : await labResultSvc.listByPatient(patientId);
    res.json({ labResults: result });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

function clinicalDecisionErrorStatus(message: string): number {
  if (message === "Clinical decision not found") return 404;
  if (message.includes("already recorded") || message.includes("already exists")) return 409;
  if (message.includes("before QA has recorded")) return 422;
  return 500;
}

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

export async function getClinicalDecisionHandler(req: Request, res: Response) {
  try {
    const result = await clinicalDecisionSvc.get(String(req.params.id));
    res.json({ clinicalDecision: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(message === "Clinical decision not found" ? 404 : 500).json({ error: message });
  }
}

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
