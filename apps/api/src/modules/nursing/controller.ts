import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { userHasPermission } from "../../lib/rbac.js";
import { nursingCaseService } from "./service.js";
import { AppError } from "../../lib/errors.js";

function errorStatus(err: unknown): number {
  return err instanceof AppError ? err.statusCode : 500;
}
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Internal server error";
}

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

// requireAuthenticated, not requirePermission — a Nursing Officer reading their OWN case is a
// right, ownership-or-permission (nursingCase:update, for QA) is resolved here since the record
// needs to be loaded first to know who started it.
export async function getCaseHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const result = await nursingCaseService.getById(String(req.params.id));
    const isOwner = result.startedBy === callerId;
    if (!isOwner && !(await userHasPermission(callerId, "nursingCase", "update"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.json({ case: result });
  } catch (err) {
    res.status(errorStatus(err)).json({ error: errorMessage(err) });
  }
}

export async function listMyCasesHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const result = await nursingCaseService.listMine(callerId);
    res.json({ cases: result });
  } catch (err) {
    res.status(errorStatus(err)).json({ error: errorMessage(err) });
  }
}

// requirePermission("nursingCase", "update") at the route layer already gates this to QA.
export async function listPendingReviewHandler(_req: Request, res: Response) {
  try {
    const result = await nursingCaseService.listPendingReview();
    res.json({ cases: result });
  } catch (err) {
    res.status(errorStatus(err)).json({ error: errorMessage(err) });
  }
}

export async function submitDocumentationSheetHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const { upiCodeEntered, idPhotoFileId, fileReference } = req.body;
    const result = await nursingCaseService.submitDocumentationSheet(String(req.params.id), callerId, {
      upiCodeEntered, idPhotoFileId, fileReference,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(errorStatus(err)).json({ error: errorMessage(err) });
  }
}

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
