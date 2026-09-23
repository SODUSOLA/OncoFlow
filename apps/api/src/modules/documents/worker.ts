import { Worker, type Job } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "../../config.js";
import { VIRUS_SCAN_QUEUE_NAME, processVirusScanJob } from "./queue.js";

// Separate from queue.ts because importing this starts a Worker, which should only happen in the real server process, never as a test import side effect.
const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

let worker: Worker | null = null;

// Starts the virus-scan Worker once and returns the existing one on repeat calls.
export function startVirusScanWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(
    VIRUS_SCAN_QUEUE_NAME,
    async (job: Job<{ fileId: string }>) => processVirusScanJob(job.data.fileId),
    { connection, concurrency: 1 },
  );
  worker.on("failed", (job, err) => {
    console.error(`Virus scan job ${job?.id} (file ${job?.data.fileId}) failed:`, err);
  });
  return worker;
}
