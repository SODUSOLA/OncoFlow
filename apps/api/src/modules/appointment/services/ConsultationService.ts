import { AppointmentService } from "../service.js";
import { AppointmentParticipantRepository } from "../repository.js";
import { MeetingService } from "../../messaging/index.js";
import { PatientRepository } from "../../patient/index.js";
import { UserRepository } from "../../auth/index.js";
import { notificationService } from "../../notification/index.js";
import { enqueueEmail } from "../../../lib/email-queue.js";
import { scheduleReminders } from "./ReminderQueue.js";

const apptSvc = new AppointmentService();
const meetingSvc = new MeetingService();
const participantRepo = new AppointmentParticipantRepository();
const patientRepo = new PatientRepository();
const userRepo = new UserRepository();

const DEFAULT_DURATION_MINUTES = 30;

// Orchestrates the Regional Admin "New Consultation" flow across appointment, availability, room, notifications and reminders, kept out of AppointmentService.
export class ConsultationService {
  // Schedules a consultation with a named consultant: validates availability, creates the appointment, provisions the room, then notifies and queues reminders.
  async scheduleConsultation(data: {
    patientId: string; oncologistId: string; facilityId: string;
    appointmentType: string; scheduledAt: string; durationMinutes?: number;
  }) {
    const appointment = await apptSvc.createAppointment({
      patientId: data.patientId, oncologistId: data.oncologistId, facilityId: data.facilityId,
      appointmentType: data.appointmentType, scheduledAt: data.scheduledAt,
      durationMinutes: data.durationMinutes, requireAvailabilityMatch: true,
    });
    const durationMinutes = appointment.durationMinutes ?? data.durationMinutes ?? DEFAULT_DURATION_MINUTES;
    const scheduledAt = new Date(appointment.scheduledAt);

    // appointment_participant holds the complete membership list, matching what MeetingService.issueToken checks.
    const [oncologist, patient] = await Promise.all([
      userRepo.findById(data.oncologistId),
      patientRepo.findById(data.patientId),
    ]);
    await participantRepo.create({ appointmentId: appointment.id, userId: data.oncologistId, role: "CONSULTANT" });
    if (patient?.userId) {
      await participantRepo.create({ appointmentId: appointment.id, userId: patient.userId, role: "PATIENT" });
    }

    // Room is provisioned at scheduling time; a provisioning failure doesn't roll back the appointment, and Admin sees a "room not ready" signal instead.
    let meeting = null;
    let roomProvisioningError: string | null = null;
    if (data.appointmentType === "VIRTUAL") {
      try {
        meeting = await meetingSvc.provisionRoom(appointment.id, { scheduledAt, durationMinutes });
      } catch (err) {
        roomProvisioningError = err instanceof Error ? err.message : "Room provisioning failed";
      }
    }

    // Immediate email and in-app notification to both participants, best-effort so it can't undo the appointment.
    await this.notifyScheduled(appointment, oncologist, patient).catch((err) => {
      console.error(`Scheduling notification failed for appointment ${appointment.id}:`, err);
    });
    await scheduleReminders(appointment.id, scheduledAt).catch((err) => {
      console.error(`Reminder scheduling failed for appointment ${appointment.id}:`, err);
    });

    return { appointment, meeting, roomProvisioningError };
  }

  private async notifyScheduled(
    appointment: { id: string; appointmentType: string; scheduledAt: string },
    oncologist: { id: string; email: string } | null,
    patient: { userId: string | null; email: string; firstName: string; lastName: string } | null,
  ) {
    const scheduledLabel = new Date(appointment.scheduledAt).toLocaleString("en-GB", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });
    const targets: { recipientId: string; email: string; otherPartyName: string }[] = [];
    if (patient?.userId) {
      targets.push({ recipientId: patient.userId, email: patient.email, otherPartyName: oncologist ? oncologist.email.split("@")[0]! : "your consultant" });
    }
    if (oncologist) {
      targets.push({ recipientId: oncologist.id, email: oncologist.email, otherPartyName: patient ? `${patient.firstName} ${patient.lastName}` : "your patient" });
    }
    await Promise.all(targets.map(async (target) => {
      await notificationService.create({ recipientId: target.recipientId, type: "APPOINTMENT_SCHEDULED" }).catch((err) => {
        console.error(`Scheduled-appointment notification failed for ${target.recipientId}:`, err);
      });
      const html = `
        <h2>New ${appointment.appointmentType.toLowerCase()} consultation scheduled</h2>
        <p>A consultation with ${target.otherPartyName} has been scheduled for ${scheduledLabel} (Africa/Lagos).</p>
      `;
      await enqueueEmail(target.email, "OncoFlow — new consultation scheduled", html).catch((err) => {
        console.error(`Scheduled-appointment email failed for ${target.email}:`, err);
      });
    }));
  }
}

export const consultationService = new ConsultationService();
