import type { Request, Response } from "express";
import { appointmentStatusEnum } from "../../db/enums.js";
import { AppointmentService } from "./service.js";
import { AppointmentRepository } from "./repository.js";

const apptSvc = new AppointmentService();
const apptRepo = new AppointmentRepository();

export async function createAppointmentHandler(req: Request, res: Response) {
  try {
    const { patientId, oncologistId, facilityId, appointmentType, scheduledAt } = req.body;
    if (!patientId || !facilityId || !appointmentType || !scheduledAt) {
      res.status(400).json({ error: "patientId, facilityId, appointmentType, scheduledAt required" });
      return;
    }
    const result = await apptSvc.createAppointment({ patientId, oncologistId, facilityId, appointmentType, scheduledAt });
    res.status(201).json({ appointment: result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
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
