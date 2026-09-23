import { Worker, type Job } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "../config.js";
import { EMAIL_QUEUE_NAME, processEmailJob, type EmailJobData } from "./email-queue.js";

// Separate from email-queue.ts because importing this starts a Worker, which should happen once, in the real server process.
const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

let worker: Worker<EmailJobData> | null = null;

// Starts the email queue Worker once and returns the existing one on repeat calls.
export function startEmailWorker(): Worker<EmailJobData> {
  if (worker) return worker;
  worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJobData>) => processEmailJob(job.data),
    // Low concurrency to stay under Resend's ~10 req/s rate limit during bursts such as bulk imports.
    { connection, concurrency: 2 },
  );
  worker.on("failed", (job, err) => {
    console.error(`Email job ${job?.id} (to ${job?.data.to}) failed:`, err);
  });
  return worker;
}
