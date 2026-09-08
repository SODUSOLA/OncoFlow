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

// ONCOFLOW_SCHEDULING_AND_VIDEO_LIFECYCLE.md's "corrected flow" — the New Consultation action,
// revived as Regional Admin work (routes.ts's POST /consultations). Deliberately its own
// service, not a method on AppointmentService: this is the one place in the codebase that needs
// to know about appointment, availability (via AppointmentService's requireAvailabilityMatch),
// messaging, notification, and the reminder queue all at once, and keeping that orchestration
// out of AppointmentService keeps that service's own import surface (and its existing tests)
// unaffected.
export class ConsultationService {
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

    // §2 — appointment_participant becomes the complete membership list (not just an extension
    // mechanism for a third invitee), matching what MeetingService.issueToken now checks.
    const [oncologist, patient] = await Promise.all([
      userRepo.findById(data.oncologistId),
      patientRepo.findById(data.patientId),
    ]);
    await participantRepo.create({ appointmentId: appointment.id, userId: data.oncologistId, role: "CONSULTANT" });
    if (patient?.userId) {
      await participantRepo.create({ appointmentId: appointment.id, userId: patient.userId, role: "PATIENT" });
    }

    // §3 — room provisioned now, not lazily on "Join Call". A provisioning failure (e.g. Daily
    // unreachable) doesn't roll back the appointment — the scheduling itself succeeded, and
    // Admin needs to see that plus a clear "room not ready yet" signal, not a false 500 that
    // hides a real appointment that now exists.
    let meeting = null;
    let roomProvisioningError: string | null = null;
    if (data.appointmentType === "VIRTUAL") {
      try {
        meeting = await meetingSvc.provisionRoom(appointment.id, { scheduledAt, durationMinutes });
      } catch (err) {
        roomProvisioningError = err instanceof Error ? err.message : "Room provisioning failed";
      }
    }

    // §4 — immediate notification (email + in-app) to both participants, best-effort (a
    // notification failure shouldn't undo a real, already-created appointment).
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
