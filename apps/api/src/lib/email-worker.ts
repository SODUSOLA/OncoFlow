import { Worker, type Job } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "../config.js";
import { EMAIL_QUEUE_NAME, processEmailJob, type EmailJobData } from "./email-queue.js";

// Deliberately a SEPARATE module from email-queue.ts (producers import that one to enqueue) —
// importing this file is what actually starts a Worker consuming from Redis, and that should
// only ever happen once, in the real server process (index.ts). Same split as
// documents/worker.ts vs documents/queue.ts.
const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

let worker: Worker<EmailJobData> | null = null;

export function startEmailWorker(): Worker<EmailJobData> {
  if (worker) return worker;
  worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJobData>) => processEmailJob(job.data),
    // Low concurrency on purpose — Resend's own rate limit is tight (10 req/s on this
    // account, confirmed via its response headers), and a burst of queued verification
    // emails (e.g. after a bulk import) shouldn't trip it.
    { connection, concurrency: 2 },
  );
  worker.on("failed", (job, err) => {
    console.error(`Email job ${job?.id} (to ${job?.data.to}) failed:`, err);
  });
  return worker;
}
