import crypto from "node:crypto";
import { Queue } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "../config.js";
import { sendEmail } from "./email.js";

// Own Redis connection because BullMQ needs maxRetriesPerRequest: null, which lib/redis.ts's keyPrefix connection doesn't allow.
const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

// Namespaced per process under test so a vitest run and a running dev server don't consume each other's jobs.
export const EMAIL_QUEUE_NAME = config.isTest
  ? `email-test-${process.pid}-${crypto.randomBytes(3).toString("hex")}`
  : "email";

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
}

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection,
  // Five attempts (more than virus-scan) because email failures are mostly transient and this queue is the only retry mechanism.
  defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 3000 } },
});

// Job handler split out of the Worker so it can be unit-tested without real BullMQ/Redis processing.
export async function processEmailJob(data: EmailJobData): Promise<void> {
  await sendEmail(data.to, data.subject, data.html);
}

// The single entry point for every email producer: a fast, durable enqueue instead of one live Resend call with no retry.
export async function enqueueEmail(to: string, subject: string, html: string): Promise<void> {
  await emailQueue.add("send", { to, subject, html });
}
