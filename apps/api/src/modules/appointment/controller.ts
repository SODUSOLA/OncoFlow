import type { Request, Response } from "express";
import { resolveScopeOrDeny } from "../../lib/facility-scope.js";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { userHasPermission } from "../../lib/rbac.js";
import { appointmentStatusEnum } from "../../db/enums.js";
import { AppointmentService, TransferRequestService } from "./service.js";
import { AppointmentRepository } from "./repository.js";
import { CalendarService } from "./services/CalendarService.js";
import { consultationService } from "./services/ConsultationService.js";
import { PatientRepository } from "../patient/index.js";
import { AppError } from "../../lib/errors.js";

const apptSvc = new AppointmentService();
const apptRepo = new AppointmentRepository();
const transferSvc = new TransferRequestService();
const calendarSvc = new CalendarService();
const patientRepoForCalendar = new PatientRepository();

// Lets a patient read their own appointments without a blanket appointment:read grant (ownership-or-permission).
async function callerOwnsPatient(callerId: string, patientId: string): Promise<boolean> {
  const patientRow = await patientRepoForCalendar.findById(patientId);
  return !!patientRow?.userId && patientRow.userId === callerId;
}

// Creates a generic appointment; the weekly-structure check applies unless the caller holds appointment:override.
export async function createAppointmentHandler(req: Request, res: Response) {
  try {
    const { patientId, oncologistId, facilityId, appointmentType, scheduledAt, override } = req.body;
    if (!patientId || !facilityId || !appointmentType || !scheduledAt) {
      res.status(400).json({ error: "patientId, facilityId, appointmentType, scheduledAt required" });
      return;
    }
    // Requesting an override does nothing unless the caller actually holds appointment:override.
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

// Regional Admin's scheduling flow: requires a named consultant, enforces their availability, provisions the room, and fires notifications and reminders.
export async function scheduleConsultationHandler(req: Request, res: Response) {
  try {
    const { patientId, oncologistId, facilityId, appointmentType, scheduledAt, durationMinutes } = req.body;
    const result = await consultationService.scheduleConsultation({
      patientId, oncologistId, facilityId, appointmentType, scheduledAt, durationMinutes,
    });
    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof AppError ? err.statusCode
      : message.includes("Mon/Wed/Fri") || message.includes("Tue/Thu") ? 422
      : 500;
    res.status(status).json({ error: message });
  }
}

// Returns one appointment, allowed for its patient or staff with appointment:read.
export async function getAppointmentHandler(req: Request, res: Response) {
  try {
    const result = await apptSvc.getAppointment(String(req.params.id));
    if (!result) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }

    const callerId = (req as AuthenticatedRequest).userId;
    const isSelf = await callerOwnsPatient(callerId, result.patientId);
    if (!isSelf && !(await userHasPermission(callerId, "appointment", "read"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.json({ appointment: result });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Lists appointments by patient (ownership or permission) or by facility scope.
export async function listAppointmentsHandler(req: Request, res: Response) {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    // ?facilityId is left for resolveScopeOrDeny below, which narrows it to what the caller may see.
    const status = typeof req.query.status === "string" && appointmentStatusEnum.enumValues.includes(req.query.status as never)
      ? req.query.status
      : undefined;

    const callerId = (req as AuthenticatedRequest).userId;
    if (patientId) {
      const isSelf = await callerOwnsPatient(callerId, patientId);
      if (!isSelf && !(await userHasPermission(callerId, "appointment", "read"))) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    } else if (!(await userHasPermission(callerId, "appointment", "read"))) {
      // facilityId/status-only queries are inherently staff/facility-wide — no "self" concept.
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // The patientId path is already authorized above; the facility path narrows the untrusted ?facilityId to the caller's real scope.
    let results;
    if (patientId) {
      results = await apptSvc.listAppointments({ patientId, status });
    } else {
      const scope = await resolveScopeOrDeny(req, res, "appointment");
      if (!scope) return;
      results = await apptSvc.listAppointments(
        scope.kind === "unrestricted" ? { status } : { facilityIds: scope.facilityIds, status },
      );
    }
    res.json({ appointments: results });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Moves an appointment through its status lifecycle.
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

// Staff-only queue of today's PAID-but-PENDING appointments awaiting confirmation before the 2PM cutoff.
export async function listPendingConfirmationQueueHandler(req: Request, res: Response) {
  try {
    const scope = await resolveScopeOrDeny(req, res, "appointment");
    if (!scope) return;
    const results = await apptSvc.listPendingConfirmationQueue(
      scope.kind === "unrestricted" ? undefined : scope.facilityIds,
    );
    res.json({ appointments: results });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Adds a participant to an appointment.
export async function addParticipantHandler(req: Request, res: Response) {
  try {
    const { userId, role } = req.body;
    if (!userId || !role) {
      res.status(400).json({ error: "userId and role required" });
      return;
    }
    const caller = req as AuthenticatedRequest;
    const appt = await apptRepo.findById(String(req.params.id));
    if (!appt) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }
    const resourceFacilityId = appt.facilityId;
    const callerFacilityId = caller.facilityId;
    if (resourceFacilityId && callerFacilityId && resourceFacilityId !== callerFacilityId) {
      res.status(403).json({ error: "Forbidden — you can only add participants to appointments at your facility" });
      return;
    }
    const result = await apptSvc.addParticipant(String(req.params.id), userId, role);
    res.status(201).json({ participant: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(message === "Appointment not found" ? 404 : 500).json({ error: message });
  }
}

// Deletes an appointment.
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

// One calendar endpoint for every role; scope comes from the caller's identity, never from a client-supplied facility or patient id.
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

// Starts a transfer request for a patient between facilities.
export async function initiateTransferHandler(req: Request, res: Response) {
  try {
    const { patientId, fromFacilityId, toFacilityId } = req.body;
    const requestedBy = (req as AuthenticatedRequest).userId;
    const transfer = await transferSvc.initiate({ patientId, fromFacilityId, toFacilityId, requestedBy });
    res.status(201).json({ transfer });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Lists transfer requests.
export async function listTransfersHandler(req: Request, res: Response) {
  try {
    const region = typeof req.query.region === "string" ? req.query.region : undefined;
    const transfers = await transferSvc.listForRegion(region);
    res.json({ transfers });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}
