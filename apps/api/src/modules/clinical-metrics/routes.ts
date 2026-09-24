import { Router } from "express";
import { z } from "zod";
import {
  getRegimenHandler, createRegimenHandler, getLatestVitalsHandler, getVitalTrendHandler, recordVitalHandler,
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
  // Required (and checked against the case) when a nursing officer records; ignored for other callers.
  nursingCaseId: z.string().uuid().optional(),
});
const labValueSchema = z.object({
  analyteCode: z.string().trim().min(1).max(50),
  value: z.number(),
  unit: z.string().trim().min(1).max(20),
});
const recordClinicalMetricsSchema = z.object({
  patientId: z.string().uuid(),
  regimenCycleId: z.string().uuid().optional(),
  // Bounds keep BMI/BSA/CrCl/eGFR meaningful: these feed the case-lock decision, so garbage can't be allowed in.
  weightKg: z.number().min(1).max(500),
  heightCm: z.number().min(30).max(260),
  ageYears: z.number().int().min(0).max(130),
  sex: z.enum(biologicalSexEnum.enumValues),
  labValues: z.array(labValueSchema).min(1),
  sourceLabDocumentId: z.string().uuid().optional(),
}).refine((v) => {
  const creatinine = v.labValues.find((l) => l.analyteCode === "CREATININE");
  return !!creatinine && creatinine.value > 0;
}, { message: "Creatinine is required and must be positive to compute CrCl and eGFR", path: ["labValues"] });
const createRegimenSchema = z.object({
  patientId: z.string().uuid(),
  drugName: z.string().trim().min(1).max(255),
  protocolCode: z.string().trim().min(1).max(100),
  diagnosis: z.string().trim().min(1).max(500),
  totalCycles: z.number().int().min(1).max(50),
  cycleIntervalDays: z.number().int().min(1).max(180),
  startedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const router = Router();

// GETs require only authentication; ownership-or-permission is checked in the controller so patients can read their own data.
router.get("/regimen", requireAuthenticated(), validateQuery(patientIdQuerySchema), getRegimenHandler);
// A consultant prescribing a new regimen — diagnosis lives here, stated once per treatment plan, not
// retyped by the nurse at every visit (see nursing/service.ts).
router.post("/regimen", requirePermission("regimen", "create"), validateBody(createRegimenSchema), createRegimenHandler);
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
