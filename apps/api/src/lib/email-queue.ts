import { Queue } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "../config.js";
import { sendEmail } from "./email.js";

// Same reasoning as documents/queue.ts's own connection: BullMQ needs maxRetriesPerRequest:
// null and doesn't get along with lib/redis.ts's keyPrefix-tuned connection, so it gets its own.
const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

export const EMAIL_QUEUE_NAME = "email";

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
}

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection,
  // More attempts than virus-scan's 3: email failures here are far more often transient
  // (vendor rate limits, network blips, a brief Resend outage) than a logic error, and unlike
  // a scan there's no PENDING state visible anywhere for the caller to retry manually — this
  // queue is the only retry mechanism there is.
  defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 3000 } },
});

// Factored out of the Worker's processor so it's directly unit-testable (mocking sendEmail)
// without spinning up real BullMQ/Redis job processing — same shape as
// documents/queue.ts's processVirusScanJob.
export async function processEmailJob(data: EmailJobData): Promise<void> {
  await sendEmail(data.to, data.subject, data.html);
}

// The single call site every email producer (VerificationEmailService, billing's EmailService,
// etc.) should use instead of calling sendEmail directly — enqueueing is a fast, durable Redis
// write, so a caller doing `void enqueueEmail(...).catch(...)` is no longer betting delivery on
// one live HTTP call to Resend succeeding on the first try with zero retry.
export async function enqueueEmail(to: string, subject: string, html: string): Promise<void> {
  await emailQueue.add("send", { to, subject, html });
}
