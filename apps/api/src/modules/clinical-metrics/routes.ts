import { Router } from "express";
import { z } from "zod";
import {
  getRegimenHandler, getLatestVitalsHandler, getVitalTrendHandler, recordVitalHandler,
  getCurrentClinicalMetricsHandler, recordClinicalMetricsHandler,
  listLabDocumentsHandler, getActivityLogHandler, getActiveCaseLockHandler,
} from "./controller.js";
import { requireAuthenticated, requirePermission } from "../../lib/rbac.js";
import { validateBody, validateQuery } from "../../lib/validation.js";
import { vitalTypeEnum, vitalSourceEnum, biologicalSexEnum } from "../../db/enums.js";

const patientIdQuerySchema = z.object({ patientId: z.string().uuid() });
const vitalTrendQuerySchema = z.object({
  patientId: z.string().uuid(),
  vitalType: z.enum(vitalTypeEnum.enumValues),
  limit: z.coerce.number().int().min(1).max(90).optional(),
});
const recordVitalSchema = z.object({
  patientId: z.string().uuid(),
  vitalType: z.enum(vitalTypeEnum.enumValues),
  value: z.number(),
  source: z.enum(vitalSourceEnum.enumValues),
  meetingId: z.string().uuid().optional(),
});
const labValueSchema = z.object({
  analyteCode: z.string().trim().min(1).max(50),
  value: z.number(),
  unit: z.string().trim().min(1).max(20),
});
const recordClinicalMetricsSchema = z.object({
  patientId: z.string().uuid(),
  regimenCycleId: z.string().uuid().optional(),
  weightKg: z.number().positive(),
  heightCm: z.number().positive(),
  ageYears: z.number().int().positive(),
  sex: z.enum(biologicalSexEnum.enumValues),
  labValues: z.array(labValueSchema).min(1),
  sourceLabDocumentId: z.string().uuid().optional(),
});

const router = Router();

// GETs go through requireAuthenticated, not requirePermission — a patient reading their own
// regimen/vitals/labs/case-lock is a right, ownership-or-permission checked inside the
// controller (same pattern as clinical/labResult).
router.get("/regimen", requireAuthenticated(), validateQuery(patientIdQuerySchema), getRegimenHandler);
router.get("/vitals/latest", requireAuthenticated(), validateQuery(patientIdQuerySchema), getLatestVitalsHandler);
router.get("/vitals/trend", requireAuthenticated(), validateQuery(vitalTrendQuerySchema), getVitalTrendHandler);
router.post("/vitals", requirePermission("vital", "create"), validateBody(recordVitalSchema), recordVitalHandler);
router.get("/clinical-metrics/current", requireAuthenticated(), validateQuery(patientIdQuerySchema), getCurrentClinicalMetricsHandler);
router.post("/clinical-metrics", requirePermission("clinicalMetrics", "create"), validateBody(recordClinicalMetricsSchema), recordClinicalMetricsHandler);
router.get("/lab-documents", requireAuthenticated(), validateQuery(patientIdQuerySchema), listLabDocumentsHandler);
router.get(
  "/activity-log",
  requireAuthenticated(),
  validateQuery(patientIdQuerySchema.extend({ limit: z.coerce.number().int().min(1).max(100).optional() })),
  getActivityLogHandler,
);
router.get("/case-locks/active", requireAuthenticated(), validateQuery(patientIdQuerySchema), getActiveCaseLockHandler);

export { router as clinicalMetricsRoutes };
