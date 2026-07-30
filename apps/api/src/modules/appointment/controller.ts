import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { appointmentStatusEnum } from "../../db/enums.js";
import { AppointmentService } from "./service.js";
import { AppointmentRepository } from "./repository.js";
import { CalendarService } from "./services/CalendarService.js";
import { PatientRepository } from "../patient/index.js";

const apptSvc = new AppointmentService();
const apptRepo = new AppointmentRepository();
const calendarSvc = new CalendarService();
const patientRepoForCalendar = new PatientRepository();

export async function createAppointmentHandler(req: Request, res: Response) {
  try {
    const { patientId, oncologistId, facilityId, appointmentType, scheduledAt, override } = req.body;
    if (!patientId || !facilityId || !appointmentType || !scheduledAt) {
      res.status(400).json({ error: "patientId, facilityId, appointmentType, scheduledAt required" });
      return;
    }
    // FR-20: requesting an override does nothing unless the caller actually holds the
    // appointment:override permission — a role without it can send override:true all day
    // and the weekly-structure check still applies.
    const canOverride = Boolean(override) && ((req as AuthenticatedRequest).permissions ?? []).includes("appointment:override");
    const result = await apptSvc.createAppointment({
      patientId, oncologistId, facilityId, appointmentType, scheduledAt, overrideWeeklyStructure: canOverride,
    });
    res.status(201).json({ appointment: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("Mon/Wed/Fri") || message.includes("Tue/Thu") ? 422 : 500;
    res.status(status).json({ error: message });
  }
}

export async function getAppointmentHandler(req: Request, res: Response) {
  try {
    const result = await apptSvc.getAppointment(String(req.params.id));
    if (!result) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }
    res.json({ appointment: result });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function listAppointmentsHandler(req: Request, res: Response) {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    const facilityId = typeof req.query.facilityId === "string" ? req.query.facilityId : undefined;
    const status = typeof req.query.status === "string" && appointmentStatusEnum.enumValues.includes(req.query.status as never)
      ? req.query.status
      : undefined;
    const results = await apptSvc.listAppointments({
      patientId,
      facilityId,
      status,
    });
    res.json({ appointments: results });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function updateAppointmentStatusHandler(req: Request, res: Response) {
  try {
    const { status } = req.body;
    if (!status) {
      res.status(400).json({ error: "status required" });
      return;
    }
    const result = await apptSvc.updateStatus(String(req.params.id), status);
    res.json({ appointment: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const statusCode = message.includes("not found") ? 404 : message.includes("Cannot transition") || message.includes("cutoff") ? 400 : 500;
    res.status(statusCode).json({ error: message });
  }
}

export async function addParticipantHandler(req: Request, res: Response) {
  try {
    const { userId, role } = req.body;
    if (!userId || !role) {
      res.status(400).json({ error: "userId and role required" });
      return;
    }
    const result = await apptSvc.addParticipant(String(req.params.id), userId, role);
    res.status(201).json({ participant: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(message === "Appointment not found" ? 404 : 500).json({ error: message });
  }
}

export async function deleteAppointmentHandler(req: Request, res: Response) {
  try {
    const result = await apptRepo.softDelete(String(req.params.id));
    if (!result) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }
    res.json({ message: "Appointment deleted" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// FR-24: one calendar-aggregation endpoint reused by every role — scope is resolved from
// the caller's own identity here, never from a client-supplied query param, so no role can
// widen its own view by just asking for a different facilityId/patientId.
export async function getUnifiedCalendarHandler(req: Request, res: Response) {
  try {
    const authed = req as AuthenticatedRequest;

    if (authed.permissions?.includes("*:*")) {
      const items = await calendarSvc.getUnifiedCalendar({});
      res.json({ items });
      return;
    }

    if (authed.facilityId) {
      const items = await calendarSvc.getUnifiedCalendar({ facilityId: authed.facilityId });
      res.json({ items });
      return;
    }

    const ownPatient = await patientRepoForCalendar.findByUserId(authed.userId);
    if (ownPatient) {
      const items = await calendarSvc.getUnifiedCalendar({ patientId: ownPatient.id });
      res.json({ items });
      return;
    }

    res.status(403).json({ error: "Unable to resolve a calendar scope for this account" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}
