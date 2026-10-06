import type { AppointmentStatus } from "./entities/Appointment.js";
import { Appointment } from "./entities/Appointment.js";
import { canConfirmOnDay, isAfter2pmNigeria } from "./entities/cutoff.js";
import { checkWeeklyStructure } from "./entities/weekly-structure.js";
import { nextWorkingDayFor } from "./entities/next-working-day.js";
import { AppointmentRepository, AppointmentParticipantRepository, TransferRequestRepository } from "./repository.js";
import { appointmentTypeEnum } from "../../db/enums.js";
// Cross-module read to get the patient's userId, the notification recipient this module doesn't own.
import { PatientRepository } from "../patient/index.js";
import { notificationService } from "../notification/index.js";
import { FacilityRepository } from "../facility/index.js";
import { availabilityService } from "../availability/index.js";
import { ForbiddenError } from "../../lib/errors.js";

const DEFAULT_DURATION_MINUTES = 30;

type AppointmentType = (typeof appointmentTypeEnum.enumValues)[number];

const repo = new AppointmentRepository();
const participantRepo = new AppointmentParticipantRepository();
const patientRepo = new PatientRepository();
const transferRequestRepo = new TransferRequestRepository();
const facilityRepo = new FacilityRepository();

// Sends the patient an appointment notification of the given type.
async function notifyPatient(patientId: string, type: "APPOINTMENT_CONFIRMED" | "APPOINTMENT_RESCHEDULED", appointmentId: string) {
  const patientRow = await patientRepo.findById(patientId);
  if (!patientRow?.userId) return;
  await notificationService.create({ recipientId: patientRow.userId, type, referenceId: appointmentId }).catch((err) => {
    console.error(`Notification (${type}) failed for patient ${patientId}:`, err);
  });
}

// Business logic for appointments.
export class AppointmentService {
  // Creates an appointment after checking weekly structure, override permission and (optionally) consultant availability.
  async createAppointment(data: {
    patientId: string;
    oncologistId?: string;
    facilityId: string;
    appointmentType: string;
    scheduledAt: string;
    durationMinutes?: number;
    overrideWeeklyStructure?: boolean;
    // Off by default so existing callers behave unchanged; only the Regional Admin consultation flow opts in to server-side availability matching.
    requireAvailabilityMatch?: boolean;
  }) {
    if (!appointmentTypeEnum.enumValues.includes(data.appointmentType as AppointmentType)) {
      throw new Error("Unsupported appointment type");
    }

    const scheduledAt = new Date(data.scheduledAt);
    if (!data.overrideWeeklyStructure) {
      const structure = checkWeeklyStructure(data.appointmentType, scheduledAt);
      if (!structure.allowed) throw new Error(structure.reason);
    }

    const durationMinutes = data.durationMinutes ?? DEFAULT_DURATION_MINUTES;

    if (data.requireAvailabilityMatch) {
      if (!data.oncologistId) throw new Error("An assigned consultant is required to check availability");
      const fits = await availabilityService.isWithinAvailability(data.oncologistId, scheduledAt, durationMinutes);
      if (!fits) throw new ForbiddenError("Requested time falls outside the consultant's stated availability");
    }

    const row = await repo.create({
      patientId: data.patientId,
      oncologistId: data.oncologistId ?? null,
      facilityId: data.facilityId,
      appointmentType: data.appointmentType as AppointmentType,
      scheduledAt,
      durationMinutes,
    });
    return new Appointment(row).toJSON();
  }

  // Returns one appointment or throws NotFoundError.
  async getAppointment(id: string) {
    const row = await repo.findById(id);
    if (!row) return null;
    return new Appointment(row).toJSON();
  }

  // Lists appointments by the given filters.
  async listAppointments(filters?: {
    patientId?: string; facilityId?: string; facilityIds?: string[]; status?: string;
  }) {
    const rows = await repo.findAll(
      filters
        ? { ...filters, status: filters.status as AppointmentStatus | undefined }
        : undefined,
    );
    return rows.map((r) => new Appointment(r).toJSON());
  }

  // Applies a status transition through the domain entity and notifies the patient where relevant.
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
        void notifyPatient(entity.patientId, "APPOINTMENT_CONFIRMED", entity.id);
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

  // Adds a participant to an existing appointment.
  async addParticipant(appointmentId: string, userId: string, role: string) {
    const appt = await repo.findById(appointmentId);
    if (!appt) throw new Error("Appointment not found");
    const row = await participantRepo.create({ appointmentId, userId, role });
    return row;
  }

  // Handles a just-paid invoice: before 2PM Lagos it stays PENDING for same-day confirmation, after it auto-reschedules; a no-op if already past PENDING.
  async handlePaymentEvent(appointmentId: string, paidAt: Date): Promise<void> {
    const row = await repo.findById(appointmentId);
    if (!row || row.status !== "PENDING") return;

    if (isAfter2pmNigeria(paidAt)) {
      const nextDate = nextWorkingDayFor(row.appointmentType, row.scheduledAt, paidAt);
      await repo.update(appointmentId, { scheduledAt: nextDate });
      void notifyPatient(row.patientId, "APPOINTMENT_RESCHEDULED", row.id);
    }
    // Before 2PM nothing changes; the queue query picks the appointment up via the PENDING/PAID join.
  }

  // Returns today's confirmation queue for the given facilities.
  async listPendingConfirmationQueue(facilityIds?: string[]) {
    const rows = await repo.findPendingConfirmationQueue(facilityIds);
    return rows.map((r) => new Appointment(r).toJSON());
  }
}

// Initiate-only: approval of transfers is unresolved in the specs, so nothing here sets approvedBy or leaves PENDING.
export class TransferRequestService {
  // Creates a PENDING transfer request.
  async initiate(data: { patientId: string; fromFacilityId: string; toFacilityId: string; requestedBy: string }) {
    return transferRequestRepo.create(data);
  }

  // Lists transfers involving any facility in the region.
  async listForRegion(region: string | undefined) {
    const allFacilities = await facilityRepo.findAll();
    const facilities = region ? allFacilities.filter((f) => f.region === region) : allFacilities;
    return transferRequestRepo.findByFacilityIds(facilities.map((f) => f.id));
  }
}
