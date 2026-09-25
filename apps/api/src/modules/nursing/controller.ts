import { nurseMayReadPatient, OUTSIDE_VISIT_WINDOW_MESSAGE } from "./visitWindow.js";
import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { userHasPermission, userHasRole } from "../../lib/rbac.js";
import { reviewerMayAccess, OUT_OF_SCOPE_MESSAGE } from "./reviewerScope.js";
import { nursingCaseService } from "./service.js";
import { AppError } from "../../lib/errors.js";
import { PatientRepository } from "../patient/index.js";

const patientRepo = new PatientRepository();

// Maps an error to its HTTP status, defaulting to 500.
function errorStatus(err: unknown): number {
  return err instanceof AppError ? err.statusCode : 500;
}
// Extracts a client-safe message from an error.
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Internal server error";
}

// Starts a nursing case for a regimen cycle.
export async function startCaseHandler(req: Request, res: Response) {
  try {
    const { patientId, regimenCycleId } = req.body;
    const startedBy = (req as AuthenticatedRequest).userId;
    const result = await nursingCaseService.startCase(patientId, regimenCycleId, startedBy);
    res.status(201).json({ case: result });
  } catch (err) {
    res.status(errorStatus(err)).json({ error: errorMessage(err) });
  }
}

// The nurse reads their own case as a right; ownership-or-permission (nursingCase:update for QA) is resolved here once the record is loaded.
export async function getCaseHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const result = await nursingCaseService.getById(String(req.params.id));
    const isOwner = result.startedBy === callerId;
    if (!isOwner && !(await userHasPermission(callerId, "nursingCase", "update"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    // A reviewer who isn't the owner sees only their own facility's cases.
    if (!isOwner && !(await reviewerMayAccess(callerId, result.patientFacilityId))) {
      res.status(403).json({ error: OUT_OF_SCOPE_MESSAGE });
      return;
    }
    res.json({ case: result });
  } catch (err) {
    res.status(errorStatus(err)).json({ error: errorMessage(err) });
  }
}

// Lists the caller's own nursing cases.
export async function listMyCasesHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const result = await nursingCaseService.listMine(callerId);
    res.json({ cases: result });
  } catch (err) {
    res.status(errorStatus(err)).json({ error: errorMessage(err) });
  }
}

// The patient folder's case history — requirePermission("patient", "read") at the route layer already
// gates this to roles with legitimate clinical access to patients, not just the nurse who opened a case.
export async function listCasesByPatientHandler(req: Request, res: Response) {
  try {
    const patientId = String(req.query.patientId);
    // A QA officer's patient history is limited to their own facility's patients.
    const callerId = (req as AuthenticatedRequest).userId;
    if (await userHasRole(callerId, "QUALITY_ASSURANCE_OFFICER")) {
      const patientRow = await patientRepo.findById(patientId);
      if (!patientRow || !(await reviewerMayAccess(callerId, patientRow.facilityId))) {
        res.status(403).json({ error: OUT_OF_SCOPE_MESSAGE });
        return;
      }
    }
    if (!(await nurseMayReadPatient(callerId, patientId))) {
      res.status(403).json({ error: OUTSIDE_VISIT_WINDOW_MESSAGE });
      return;
    }
    const result = await nursingCaseService.listByPatient(patientId);
    res.json({ cases: result });
  } catch (err) {
    res.status(errorStatus(err)).json({ error: errorMessage(err) });
  }
}

// requirePermission("nursingCase", "update") at the route layer already gates this to QA.
export async function listPendingReviewHandler(req: Request, res: Response) {
  try {
    const result = await nursingCaseService.listPendingReview((req as AuthenticatedRequest).userId);
    res.json({ cases: result });
  } catch (err) {
    res.status(errorStatus(err)).json({ error: errorMessage(err) });
  }
}

// The nurse confirms the patient matches their profile photo.
export async function verifyIdentityHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const result = await nursingCaseService.verifyIdentity(String(req.params.id), callerId);
    res.json({ case: result });
  } catch (err) {
    res.status(errorStatus(err)).json({ error: errorMessage(err) });
  }
}

// The nurse reports that the patient doesn't match the profile on file.
export async function reportMismatchHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const report = await nursingCaseService.reportIdentityMismatch(String(req.params.id), callerId, req.body.note);
    res.status(201).json({ report });
  } catch (err) {
    res.status(errorStatus(err)).json({ error: errorMessage(err) });
  }
}

// Submits the documentation sheet for a case. diagnosis and managingConsultant aren't accepted here —
// both are resolved server-side (from the cycle's regimen and the patient's facility; see the service),
// never taken from the client.
export async function submitDocumentationSheetHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const {
      fileReference,
      treatmentDate, note, nextAppointmentDate,
    } = req.body;
    const result = await nursingCaseService.submitDocumentationSheet(String(req.params.id), callerId, {
      fileReference,
      treatmentDate, note, nextAppointmentDate,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(errorStatus(err)).json({ error: errorMessage(err) });
  }
}

// Records a security incident for a file flagged INFECTED.
export async function reportSecurityIncidentHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const { fileId, nursingCaseId } = req.body;
    const result = await nursingCaseService.reportSecurityIncident(callerId, fileId, nursingCaseId);
    res.status(201).json({ incident: result });
  } catch (err) {
    res.status(errorStatus(err)).json({ error: errorMessage(err) });
  }
}

// requirePermission("securityIncident", "read") at the route layer (Regional Admin only).
export async function listSecurityIncidentsHandler(req: Request, res: Response) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const result = await nursingCaseService.listRecentSecurityIncidents(limit);
    res.json({ incidents: result });
  } catch (err) {
    res.status(errorStatus(err)).json({ error: errorMessage(err) });
  }
}

// Records QA's review decision on a case.
export async function reviewCaseHandler(req: Request, res: Response) {
  try {
    const reviewedBy = (req as AuthenticatedRequest).userId;
    const { decision, reason } = req.body;
    const result = await nursingCaseService.review(String(req.params.id), reviewedBy, decision, reason);
    res.json(result);
  } catch (err) {
    res.status(errorStatus(err)).json({ error: errorMessage(err) });
  }
}
