import crypto from "node:crypto";
import { Queue } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "../../../config.js";

// ONCOFLOW_SCHEDULING_AND_VIDEO_LIFECYCLE.md §4 — "needs either a recurring worker... or a
// delayed-job queue." BullMQ already runs in this process for email/virus-scan (lib/email-queue.ts,
// modules/documents/queue.ts); its native `delay` option is exactly a delayed-job queue, so this
// reuses that infra rather than adding cron/a new worker process. Same connection-tuning and
// test-namespacing reasoning as lib/email-queue.ts.
const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

export const REMINDER_QUEUE_NAME = config.isTest
  ? `appointment-reminder-test-${process.pid}-${crypto.randomBytes(3).toString("hex")}`
  : "appointment-reminder";

export type ReminderOffset = "-60min" | "-30min" | "-15min" | "0min";

export interface ReminderJobData {
  appointmentId: string;
  offset: ReminderOffset;
}

export const reminderQueue = new Queue<ReminderJobData>(REMINDER_QUEUE_NAME, {
  connection,
  defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
});

const OFFSET_MINUTES: Record<ReminderOffset, number> = {
  "-60min": 60, "-30min": 30, "-15min": 15, "0min": 0,
};

// BullMQ job ids reject ":" (throws "Custom Id cannot contain :"), confirmed live — "_" instead.
function reminderJobId(appointmentId: string, offset: ReminderOffset): string {
  return `${appointmentId}_${offset}`;
}

// Schedules whichever of the 4 offsets are still in the future relative to now — an appointment
// created 20 minutes out only gets its -15min and 0min reminders, not two reminders for moments
// that have already passed. Deterministic per-appointment job ids make this safely re-callable
// (e.g. if scheduling is retried) without double-booking reminders.
export async function scheduleReminders(appointmentId: string, scheduledAt: Date): Promise<void> {
  const now = Date.now();
  const offsets = (Object.keys(OFFSET_MINUTES) as ReminderOffset[]).filter((offset) => {
    const fireAt = scheduledAt.getTime() - OFFSET_MINUTES[offset] * 60_000;
    return fireAt > now;
  });
  await Promise.all(offsets.map((offset) => {
    const fireAt = scheduledAt.getTime() - OFFSET_MINUTES[offset] * 60_000;
    return reminderQueue.add(
      "remind",
      { appointmentId, offset },
      { delay: fireAt - now, jobId: reminderJobId(appointmentId, offset) },
    );
  }));
}

// Cancelling an appointment shouldn't leave stale reminders queued — best-effort removal, same
// tolerance the rest of this codebase gives non-critical side effects.
export async function cancelReminders(appointmentId: string): Promise<void> {
  await Promise.all((Object.keys(OFFSET_MINUTES) as ReminderOffset[]).map((offset) =>
    reminderQueue.remove(reminderJobId(appointmentId, offset)).catch(() => {}),
  ));
}
