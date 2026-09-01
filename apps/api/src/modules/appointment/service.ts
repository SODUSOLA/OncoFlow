import type { AppointmentStatus } from "./entities/Appointment.js";
import { Appointment } from "./entities/Appointment.js";
import { canConfirmOnDay, isAfter2pmNigeria } from "./entities/cutoff.js";
import { checkWeeklyStructure } from "./entities/weekly-structure.js";
import { nextWorkingDayFor } from "./entities/next-working-day.js";
import { AppointmentRepository, AppointmentParticipantRepository, TransferRequestRepository } from "./repository.js";
import { appointmentTypeEnum } from "../../db/enums.js";
// Cross-module reads — same pattern as billing/controller.ts's PatientRepository import: need
// the patient's userId (notification recipient) which this module doesn't own.
import { PatientRepository } from "../patient/index.js";
import { notificationService } from "../notification/index.js";
import { FacilityRepository } from "../facility/index.js";

type AppointmentType = (typeof appointmentTypeEnum.enumValues)[number];

const repo = new AppointmentRepository();
const participantRepo = new AppointmentParticipantRepository();
const patientRepo = new PatientRepository();
const transferRequestRepo = new TransferRequestRepository();
const facilityRepo = new FacilityRepository();

async function notifyPatient(patientId: string, type: "APPOINTMENT_CONFIRMED" | "APPOINTMENT_RESCHEDULED") {
  const patientRow = await patientRepo.findById(patientId);
  if (!patientRow?.userId) return;
  await notificationService.create({ recipientId: patientRow.userId, type }).catch((err) => {
    console.error(`Notification (${type}) failed for patient ${patientId}:`, err);
  });
}

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
        void notifyPatient(entity.patientId, "APPOINTMENT_CONFIRMED");
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

  // Categorizes a just-paid, appointment-linked invoice by Lagos server-clock time: paid
  // before 2PM stays PENDING and surfaces on listPendingConfirmationQueue() for same-day staff
  // confirmation; paid at/after 2PM auto-reschedules to the next FR-20-valid working day.
  // Deliberately a no-op (not an error) for an appointment that's already left PENDING — this
  // is called from PaymentService as a best-effort side effect, not a strict precondition.
  async handlePaymentEvent(appointmentId: string, paidAt: Date): Promise<void> {
    const row = await repo.findById(appointmentId);
    if (!row || row.status !== "PENDING") return;

    if (isAfter2pmNigeria(paidAt)) {
      const nextDate = nextWorkingDayFor(row.appointmentType, row.scheduledAt, paidAt);
      await repo.update(appointmentId, { scheduledAt: nextDate });
      void notifyPatient(row.patientId, "APPOINTMENT_RESCHEDULED");
    }
    // Before 2PM: no mutation needed — findPendingConfirmationQueue picks it up via the
    // appointment-status/invoice-status join, scoped to today's Lagos date.
  }

  async listPendingConfirmationQueue(facilityId?: string) {
    const rows = await repo.findPendingConfirmationQueue(facilityId);
    return rows.map((r) => new Appointment(r).toJSON());
  }
}

// Initiate-only, deliberately: 18-admin-feature-status-workflow-pairing.md #12 flags "who
// approves a transfer" as unresolved, possibly not even Admin's own portal. This service (and
// its route) covers what IS settled — Admin initiates — and stops there rather than guessing
// at an approve action; nothing here ever sets `approvedBy` or transitions status off PENDING.
export class TransferRequestService {
  async initiate(data: { patientId: string; fromFacilityId: string; toFacilityId: string; requestedBy: string }) {
    return transferRequestRepo.create(data);
  }

  async listForRegion(region: string | undefined) {
    const allFacilities = await facilityRepo.findAll();
    const facilities = region ? allFacilities.filter((f) => f.region === region) : allFacilities;
    return transferRequestRepo.findByFacilityIds(facilities.map((f) => f.id));
  }
}
