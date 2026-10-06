import { Worker, type Job } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "../../../config.js";
import { REMINDER_QUEUE_NAME, type ReminderJobData } from "./ReminderQueue.js";
import { AppointmentRepository } from "../repository.js";
import { PatientRepository } from "../../patient/index.js";
import { UserRepository } from "../../auth/index.js";
import { notificationService } from "../../notification/index.js";
import { enqueueEmail } from "../../../lib/email-queue.js";

// Separate from ReminderQueue.ts because importing this starts a Worker, which should happen once in the real server process.
const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

const apptRepo = new AppointmentRepository();
const patientRepo = new PatientRepository();
const userRepo = new UserRepository();

const OFFSET_LABEL: Record<ReminderJobData["offset"], string> = {
  "-60min": "in 1 hour", "-30min": "in 30 minutes", "-15min": "in 15 minutes", "0min": "now",
};

// Sends the reminder notification for one appointment job.
export async function processReminderJob(data: ReminderJobData): Promise<void> {
  const appointment = await apptRepo.findById(data.appointmentId);
  // A cancelled or deleted appointment has nothing left to remind anyone about, so it is skipped rather than treated as an error.
  if (!appointment || appointment.isDeleted || appointment.status === "CANCELLED") return;

  const patient = await patientRepo.findById(appointment.patientId);
  const oncologist = appointment.oncologistId ? await userRepo.findById(appointment.oncologistId) : null;
  const when = OFFSET_LABEL[data.offset];
  const scheduledLabel = new Date(appointment.scheduledAt).toLocaleString("en-GB", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });

  const notifyTargets: { recipientId: string; email: string; otherPartyName: string }[] = [];
  if (patient?.userId) {
    notifyTargets.push({
      recipientId: patient.userId,
      email: patient.email,
      otherPartyName: oncologist ? oncologist.email.split("@")[0]! : "your consultant",
    });
  }
  if (oncologist) {
    notifyTargets.push({
      recipientId: oncologist.id,
      email: oncologist.email,
      otherPartyName: patient ? `${patient.firstName} ${patient.lastName}` : "your patient",
    });
  }

  await Promise.all(notifyTargets.map(async (target) => {
    await notificationService.create({ recipientId: target.recipientId, type: "APPOINTMENT_REMINDER", referenceId: appointment.id }).catch((err) => {
      console.error(`Reminder notification failed for ${target.recipientId}:`, err);
    });
    const html = `
      <h2>Upcoming ${appointment.appointmentType.toLowerCase()} consultation</h2>
      <p>Your consultation with ${target.otherPartyName} starts ${when} — scheduled for ${scheduledLabel} (Africa/Lagos).</p>
    `;
    await enqueueEmail(target.email, `OncoFlow — consultation starts ${when}`, html).catch((err) => {
      console.error(`Reminder email failed for ${target.email}:`, err);
    });
  }));
}

let worker: Worker<ReminderJobData> | null = null;

// Starts the reminder Worker once and returns the existing one on repeat calls.
export function startReminderWorker(): Worker<ReminderJobData> {
  if (worker) return worker;
  worker = new Worker<ReminderJobData>(
    REMINDER_QUEUE_NAME,
    async (job: Job<ReminderJobData>) => processReminderJob(job.data),
    { connection, concurrency: 2 },
  );
  worker.on("failed", (job, err) => {
    console.error(`Reminder job ${job?.id} (appointment ${job?.data.appointmentId}) failed:`, err);
  });
  return worker;
}
