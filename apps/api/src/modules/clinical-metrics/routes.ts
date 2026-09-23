import { Router } from "express";
import { z } from "zod";
import {
  getRegimenHandler, getLatestVitalsHandler, getVitalTrendHandler, recordVitalHandler,
  getCurrentClinicalMetricsHandler, recordClinicalMetricsHandler,
  listLabDocumentsHandler, getActivityLogHandler, getActiveCaseLockHandler, listRegimenCyclesHandler,
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

// GETs require only authentication; ownership-or-permission is checked in the controller so patients can read their own data.
router.get("/regimen", requireAuthenticated(), validateQuery(patientIdQuerySchema), getRegimenHandler);
// Schedule of regimen cycles at the caller's facility.
router.get(
  "/regimen-cycles",
  requirePermission("regimen", "read"),
  validateQuery(z.object({
    facilityId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    // "true" switches to the due (today + overdue, still-SCHEDULED) list instead of an exact-date match.
    due: z.enum(["true", "false"]).optional(),
  })),
  listRegimenCyclesHandler,
);
// Latest reading per vital type.
router.get("/vitals/latest", requireAuthenticated(), validateQuery(patientIdQuerySchema), getLatestVitalsHandler);
// Trend of one vital type.
router.get("/vitals/trend", requireAuthenticated(), validateQuery(vitalTrendQuerySchema), getVitalTrendHandler);
// Records a vital reading.
router.post("/vitals", requirePermission("vital", "create"), validateBody(recordVitalSchema), recordVitalHandler);
// Current clinical metrics snapshot.
router.get("/clinical-metrics/current", requireAuthenticated(), validateQuery(patientIdQuerySchema), getCurrentClinicalMetricsHandler);
// Records a clinical metrics snapshot.
router.post("/clinical-metrics", requirePermission("clinicalMetrics", "create"), validateBody(recordClinicalMetricsSchema), recordClinicalMetricsHandler);
// Lists a patient's lab documents.
router.get("/lab-documents", requireAuthenticated(), validateQuery(patientIdQuerySchema), listLabDocumentsHandler);
// Clinical activity log for a patient.
router.get(
  "/activity-log",
  requireAuthenticated(),
  validateQuery(patientIdQuerySchema.extend({ limit: z.coerce.number().int().min(1).max(100).optional() })),
  getActivityLogHandler,
);
// The patient's active case lock.
router.get("/case-locks/active", requireAuthenticated(), validateQuery(patientIdQuerySchema), getActiveCaseLockHandler);

export { router as clinicalMetricsRoutes };
