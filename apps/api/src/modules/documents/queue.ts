import { Queue } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "../../config.js";
import { downloadFromR2 } from "./services/StorageService.js";
import { scanBuffer } from "./services/ClamAvService.js";
import { FileRepository, FileVerificationStepRepository } from "./repository.js";

// BullMQ needs its own connection (maxRetriesPerRequest: null is a hard BullMQ requirement,
// and its Lua scripts don't get along with ioredis's keyPrefix option) — deliberately not
// reusing lib/redis.ts's getRedis(), which is tuned for the RBAC-cache/rate-limit use case.
const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

export const VIRUS_SCAN_QUEUE_NAME = "virus-scan";

export const virusScanQueue = new Queue(VIRUS_SCAN_QUEUE_NAME, {
  connection,
  // Dev-scale defaults: transient ClamAV/network hiccups shouldn't permanently strand a file
  // in PENDING, but this isn't tuned for high throughput.
  defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
});

const fileRepo = new FileRepository();
const stepRepo = new FileVerificationStepRepository();

// The actual scan-and-transition logic, factored out of the Worker's processor so it can be
// unit-tested directly (mocking scanBuffer) without spinning up real BullMQ/Redis job
// processing — the Worker (worker.ts) is a thin wrapper that just calls this per job.
export async function processVirusScanJob(fileId: string): Promise<"CLEAN" | "INFECTED"> {
  const fileRow = await fileRepo.findById(fileId);
  if (!fileRow) throw new Error(`File ${fileId} not found`);

  const buffer = await downloadFromR2(fileRow.storageKey);
  const result = await scanBuffer(buffer);

  await fileRepo.updateVirusScanStatus(fileId, result);
  await stepRepo.create({
    fileId,
    stepNumber: 1,
    stepName: "virus_scan",
    verifiedBy: null,
    verifiedAt: new Date(),
  });

  return result;
}
