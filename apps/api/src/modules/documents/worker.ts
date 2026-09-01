import { Worker, type Job } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "../../config.js";
import { VIRUS_SCAN_QUEUE_NAME, processVirusScanJob } from "./queue.js";

// Deliberately a SEPARATE module from queue.ts (which FileService.upload imports to enqueue
// jobs) — importing this file is what actually starts a Worker consuming from Redis, and that
// should only ever happen once, in the real server process (index.ts), never as a side effect
// of importing the documents module from a test file.
const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

let worker: Worker | null = null;

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
