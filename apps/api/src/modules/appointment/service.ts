import type { AppointmentStatus } from "./entities/Appointment.js";
import { Appointment } from "./entities/Appointment.js";
import { canConfirmOnDay } from "./entities/cutoff.js";
import { checkWeeklyStructure } from "./entities/weekly-structure.js";
import { AppointmentRepository, AppointmentParticipantRepository } from "./repository.js";
import { appointmentTypeEnum } from "../../db/enums.js";

type AppointmentType = (typeof appointmentTypeEnum.enumValues)[number];

const repo = new AppointmentRepository();
const participantRepo = new AppointmentParticipantRepository();

export class AppointmentService {
  async createAppointment(data: {
    patientId: string;
    oncologistId?: string;
    facilityId: string;
    appointmentType: string;
    scheduledAt: string;
    overrideWeeklyStructure?: boolean;
  }) {
    if (!appointmentTypeEnum.enumValues.includes(data.appointmentType as AppointmentType)) {
      throw new Error("Unsupported appointment type");
    }

    const scheduledAt = new Date(data.scheduledAt);
    if (!data.overrideWeeklyStructure) {
      const structure = checkWeeklyStructure(data.appointmentType, scheduledAt);
      if (!structure.allowed) throw new Error(structure.reason);
    }

    const row = await repo.create({
      patientId: data.patientId,
      oncologistId: data.oncologistId ?? null,
      facilityId: data.facilityId,
      appointmentType: data.appointmentType as AppointmentType,
      scheduledAt,
    });
    return new Appointment(row).toJSON();
  }

  async getAppointment(id: string) {
    const row = await repo.findById(id);
    if (!row) return null;
    return new Appointment(row).toJSON();
  }

  async listAppointments(filters?: { patientId?: string; facilityId?: string; status?: string }) {
    const rows = await repo.findAll(
      filters
        ? { ...filters, status: filters.status as AppointmentStatus | undefined }
        : undefined,
    );
    return rows.map((r) => new Appointment(r).toJSON());
  }

  async updateStatus(id: string, targetStatus: AppointmentStatus) {
    const row = await repo.findById(id);
    if (!row) throw new Error("Appointment not found");

    const entity = new Appointment(row);
    let updated: Appointment;

    switch (targetStatus) {
      case "CONFIRMED": {
        const cutoff = canConfirmOnDay(entity.scheduledAt, new Date());
        if (!cutoff.allowed) throw new Error(cutoff.reason);
        updated = entity.confirmPayment(new Date()).confirm();
        break;
      }
      case "CHECKED_IN": updated = entity.checkIn(); break;
      case "IN_PROGRESS": updated = entity.startProgress(); break;
      case "COMPLETED": updated = entity.complete(); break;
      case "CANCELLED": updated = entity.cancel(); break;
      case "MISSED": updated = entity.miss(); break;
      default:
        throw new Error(`Unsupported status transition: ${targetStatus}`);
    }

    const saved = await repo.update(id, targetStatus === "CONFIRMED"
      ? { status: updated.status, paymentConfirmedAt: updated.paymentConfirmedAt }
      : { status: updated.status });
    return new Appointment(saved!).toJSON();
  }

  async addParticipant(appointmentId: string, userId: string, role: string) {
    const appt = await repo.findById(appointmentId);
    if (!appt) throw new Error("Appointment not found");
    const row = await participantRepo.create({ appointmentId, userId, role });
    return row;
  }
}
