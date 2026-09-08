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
  // FR-20: only takes effect if the caller also holds appointment:override (checked in the
  // controller, not here) — requesting it without that permission is silently ignored, not an error.
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

router.post("/appointments", requirePermission("appointment", "create"), validateBody(createAppointmentSchema), createAppointmentHandler);
router.post("/consultations", requirePermission("appointment", "create"), validateBody(scheduleConsultationSchema), scheduleConsultationHandler);
// requireAuthenticated: a patient listing/reading their OWN appointments (e.g. to join a
// scheduled video consult) is a right, not a grant — ownership-or-permission check lives in
// the controller (callerOwnsPatient).
router.get("/appointments", requireAuthenticated(), validateQuery(listAppointmentsQuerySchema), listAppointmentsHandler);
// Must come before /appointments/:id — same "me"-style ordering reason as patients/:id vs
// patients/me elsewhere in this codebase (validateParams' uuid check would otherwise 400 this).
router.get("/appointments/pending-confirmation-queue", requirePermission("appointment", "read"), listPendingConfirmationQueueHandler);
router.get("/appointments/:id", requireAuthenticated(), validateParams(appointmentIdParamSchema), getAppointmentHandler);
router.patch("/appointments/:id/status", requirePermission("appointment", "update"), validateParams(appointmentIdParamSchema), validateBody(updateAppointmentStatusSchema), updateAppointmentStatusHandler);
router.post("/appointments/:id/participants", requirePermission("appointment", "update"), validateParams(appointmentIdParamSchema), validateBody(addParticipantSchema), addParticipantHandler);
router.delete("/appointments/:id", requirePermission("appointment", "delete"), validateParams(appointmentIdParamSchema), deleteAppointmentHandler);
router.get("/calendar", requirePermission("calendar", "read"), getUnifiedCalendarHandler);

router.post("/transfers", requirePermission("transferRequest", "create"), validateBody(initiateTransferSchema), initiateTransferHandler);
router.get("/transfers", requirePermission("transferRequest", "read"), validateQuery(listTransfersQuerySchema), listTransfersHandler);

export { router as appointmentRoutes };
