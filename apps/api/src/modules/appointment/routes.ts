import { Router } from "express";
import {
  createAppointmentHandler, getAppointmentHandler, listAppointmentsHandler,
  updateAppointmentStatusHandler, addParticipantHandler, deleteAppointmentHandler,
  getUnifiedCalendarHandler, listPendingConfirmationQueueHandler,
  initiateTransferHandler, listTransfersHandler, scheduleConsultationHandler,
} from "./controller.js";
import { requirePermission, requireAuthenticated } from "../../lib/rbac.js";
import { validateBody, validateParams, validateQuery } from "../../lib/validation.js";
import { appointmentStatusEnum, appointmentTypeEnum } from "../../db/enums.js";
import { z } from "zod";

const appointmentIdParamSchema = z.object({
  id: z.string().uuid(),
});

const createAppointmentSchema = z.object({
  patientId: z.string().uuid(),
  oncologistId: z.string().uuid().optional(),
  facilityId: z.string().uuid(),
  appointmentType: z.enum(appointmentTypeEnum.enumValues),
  scheduledAt: z.string().trim().min(1).max(64),
  // Only honored when the caller holds appointment:override (checked in the controller); otherwise silently ignored.
  override: z.boolean().optional(),
});

const listAppointmentsQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  facilityId: z.string().uuid().optional(),
  status: z.enum(appointmentStatusEnum.enumValues).optional(),
}).refine((value) => Boolean(value.patientId || value.facilityId || value.status), {
  message: "Provide patientId, facilityId, or status",
});

const updateAppointmentStatusSchema = z.object({
  status: z.enum(appointmentStatusEnum.enumValues),
});

const addParticipantSchema = z.object({
  userId: z.string().uuid(),
  role: z.string().trim().min(1).max(64),
});

const initiateTransferSchema = z.object({
  patientId: z.string().uuid(),
  fromFacilityId: z.string().uuid(),
  toFacilityId: z.string().uuid(),
});

const listTransfersQuerySchema = z.object({
  region: z.string().trim().min(1).optional(),
});

const scheduleConsultationSchema = z.object({
  patientId: z.string().uuid(),
  oncologistId: z.string().uuid(),
  facilityId: z.string().uuid(),
  appointmentType: z.enum(appointmentTypeEnum.enumValues),
  scheduledAt: z.string().trim().min(1).max(64),
  durationMinutes: z.number().int().min(5).max(240).optional(),
});

const router = Router();

// Generic appointment create, distinct from the opinionated /consultations flow.
router.post("/appointments", requirePermission("appointment", "create"), validateBody(createAppointmentSchema), createAppointmentHandler);
// Regional Admin's consultation scheduling flow.
router.post("/consultations", requirePermission("appointment", "create"), validateBody(scheduleConsultationSchema), scheduleConsultationHandler);
// requireAuthenticated because patients reading their own appointments is a right; the ownership-or-permission check is in the controller.
router.get("/appointments", requireAuthenticated(), validateQuery(listAppointmentsQuerySchema), listAppointmentsHandler);
// Must precede /appointments/:id or validateParams' uuid check would 400 this path.
router.get("/appointments/pending-confirmation-queue", requirePermission("appointment", "read"), listPendingConfirmationQueueHandler);
// Reads one appointment (ownership-or-permission in the controller).
router.get("/appointments/:id", requireAuthenticated(), validateParams(appointmentIdParamSchema), getAppointmentHandler);
// Moves an appointment through its status lifecycle.
router.patch("/appointments/:id/status", requirePermission("appointment", "update"), validateParams(appointmentIdParamSchema), validateBody(updateAppointmentStatusSchema), updateAppointmentStatusHandler);
// Adds a participant to an appointment.
router.post("/appointments/:id/participants", requirePermission("appointment", "update"), validateParams(appointmentIdParamSchema), validateBody(addParticipantSchema), addParticipantHandler);
// Soft-deletes an appointment.
router.delete("/appointments/:id", requirePermission("appointment", "delete"), validateParams(appointmentIdParamSchema), deleteAppointmentHandler);
// Unified calendar for the caller's own scope.
router.get("/calendar", requirePermission("calendar", "read"), getUnifiedCalendarHandler);

// Initiates a patient transfer between facilities.
router.post("/transfers", requirePermission("transferRequest", "create"), validateBody(initiateTransferSchema), initiateTransferHandler);
// Lists transfers in the caller's region.
router.get("/transfers", requirePermission("transferRequest", "read"), validateQuery(listTransfersQuerySchema), listTransfersHandler);

export { router as appointmentRoutes };
