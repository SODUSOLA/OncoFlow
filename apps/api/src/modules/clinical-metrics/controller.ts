import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { userHasPermission } from "../../lib/rbac.js";
import {
  RegimenService, VitalsService, ClinicalMetricsService, LabDocumentService, ActivityLogService, CaseLockService,
} from "./service.js";
import { PatientRepository } from "../patient/index.js";

const regimenSvc = new RegimenService();
const vitalsSvc = new VitalsService();
const metricsSvc = new ClinicalMetricsService();
const labDocumentSvc = new LabDocumentService();
const activityLogSvc = new ActivityLogService();
const caseLockSvc = new CaseLockService();
const patientRepo = new PatientRepository();

// Same ownership-or-permission shape used throughout apps/api (e.g. clinical/controller.ts) —
// a patient reading their own regimen/vitals/labs is a right, staff need the resource's
// `:read` grant.
async function callerOwnsPatient(callerId: string, patientId: string): Promise<boolean> {
  const patientRow = await patientRepo.findById(patientId);
  return !!patientRow?.userId && patientRow.userId === callerId;
}

async function authorizeRead(req: Request, res: Response, resource: string, patientId: string): Promise<boolean> {
  const callerId = (req as AuthenticatedRequest).userId;
  const isSelf = await callerOwnsPatient(callerId, patientId);
  if (isSelf) return true;
  if (await userHasPermission(callerId, resource, "read")) return true;
  res.status(403).json({ error: "Forbidden" });
  return false;
}

export async function getRegimenHandler(req: Request, res: Response) {
  try {
    const patientId = String(req.query.patientId);
    if (!(await authorizeRead(req, res, "regimen", patientId))) return;
    const regimenData = await regimenSvc.getForPatient(patientId);
    res.json({ regimen: regimenData });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getLatestVitalsHandler(req: Request, res: Response) {
  try {
    const patientId = String(req.query.patientId);
    if (!(await authorizeRead(req, res, "vital", patientId))) return;
    const vitals = await vitalsSvc.getLatestForPatient(patientId);
    res.json({ vitals });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getVitalTrendHandler(req: Request, res: Response) {
  try {
    const patientId = String(req.query.patientId);
    const vitalType = String(req.query.vitalType);
    const limit = req.query.limit ? Number(req.query.limit) : 14;
    if (!(await authorizeRead(req, res, "vital", patientId))) return;
    const trend = await vitalsSvc.getTrendForPatient(patientId, vitalType, limit);
    res.json({ trend });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function recordVitalHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const { patientId, vitalType, value, source, meetingId } = req.body;
    const reading = await vitalsSvc.recordReading({ patientId, vitalType, value, source, recordedBy: callerId, meetingId });
    res.status(201).json({ reading });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getCurrentClinicalMetricsHandler(req: Request, res: Response) {
  try {
    const patientId = String(req.query.patientId);
    if (!(await authorizeRead(req, res, "clinicalMetrics", patientId))) return;
    const snapshot = await metricsSvc.getCurrentForPatient(patientId);
    res.json({ snapshot });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function recordClinicalMetricsHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const { patientId, regimenCycleId, weightKg, heightCm, ageYears, sex, labValues, sourceLabDocumentId } = req.body;
    const snapshot = await metricsSvc.recordSnapshot({
      patientId, regimenCycleId, recordedBy: callerId, weightKg, heightCm, ageYears, sex, labValues, sourceLabDocumentId,
    });
    res.status(201).json({ snapshot });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(message.includes("Creatinine") ? 422 : 500).json({ error: message });
  }
}

export async function listLabDocumentsHandler(req: Request, res: Response) {
  try {
    const patientId = String(req.query.patientId);
    if (!(await authorizeRead(req, res, "labDocument", patientId))) return;
    const documents = await labDocumentSvc.listForPatient(patientId);
    res.json({ documents });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getActivityLogHandler(req: Request, res: Response) {
  try {
    const patientId = String(req.query.patientId);
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    if (!(await authorizeRead(req, res, "activityLog", patientId))) return;
    const entries = await activityLogSvc.getForPatient(patientId, limit);
    res.json({ entries });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getActiveCaseLockHandler(req: Request, res: Response) {
  try {
    const patientId = String(req.query.patientId);
    if (!(await authorizeRead(req, res, "caseLock", patientId))) return;
    const lock = await caseLockSvc.getActiveForPatient(patientId);
    res.json({ caseLock: lock });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}
