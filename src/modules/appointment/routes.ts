import { Router } from "express";
import {
  createAppointmentHandler, getAppointmentHandler, listAppointmentsHandler,
  updateAppointmentStatusHandler, addParticipantHandler, deleteAppointmentHandler,
} from "./controller.js";
import { requirePermission } from "../../lib/rbac.js";
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

const router = Router();

router.post("/appointments", requirePermission("appointment", "create"), validateBody(createAppointmentSchema), createAppointmentHandler);
router.get("/appointments", requirePermission("appointment", "read"), validateQuery(listAppointmentsQuerySchema), listAppointmentsHandler);
router.get("/appointments/:id", requirePermission("appointment", "read"), validateParams(appointmentIdParamSchema), getAppointmentHandler);
router.patch("/appointments/:id/status", requirePermission("appointment", "update"), validateParams(appointmentIdParamSchema), validateBody(updateAppointmentStatusSchema), updateAppointmentStatusHandler);
router.post("/appointments/:id/participants", requirePermission("appointment", "update"), validateParams(appointmentIdParamSchema), validateBody(addParticipantSchema), addParticipantHandler);
router.delete("/appointments/:id", requirePermission("appointment", "delete"), validateParams(appointmentIdParamSchema), deleteAppointmentHandler);

export { router as appointmentRoutes };
