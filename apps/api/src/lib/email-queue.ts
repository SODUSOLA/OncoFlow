import crypto from "node:crypto";
import { Queue } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "../config.js";
import { sendEmail } from "./email.js";

// Same reasoning as documents/queue.ts's own connection: BullMQ needs maxRetriesPerRequest:
// null and doesn't get along with lib/redis.ts's keyPrefix-tuned connection, so it gets its own.
const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

// Namespaced per process under test so a vitest run and a dev server running alongside it do
// not share one BullMQ queue. They otherwise compete for the same jobs against the same Redis:
// the dev server's worker consumes a job the test enqueued, and the test sees fewer attempts
// than it made — which surfaced as the retry test failing only while a dev server happened to
// be running, and passing the moment it was stopped. Same reasoning as the rate limiter's key
// namespace in lib/rate-limit.ts. Plain "email" everywhere else, which is what production uses.
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
