import crypto from "node:crypto";
import { Queue } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "../../../config.js";

// Reminders reuse BullMQ's native delayed jobs instead of cron or a new worker; same connection tuning and test namespacing as lib/email-queue.ts.
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

// Queues only reminder offsets still in the future, with deterministic job ids so retries don't double-book.
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

// Best-effort removal of an appointment's queued reminders when it's cancelled.
export async function cancelReminders(appointmentId: string): Promise<void> {
  await Promise.all((Object.keys(OFFSET_MINUTES) as ReminderOffset[]).map((offset) =>
    reminderQueue.remove(reminderJobId(appointmentId, offset)).catch(() => {}),
  ));
}
