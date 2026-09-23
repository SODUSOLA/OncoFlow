import { Queue } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "../../config.js";
import { downloadFromR2 } from "./services/StorageService.js";
import { scanBuffer } from "./services/ClamAvService.js";
import { FileRepository, FileVerificationStepRepository } from "./repository.js";

// Own Redis connection because BullMQ requires maxRetriesPerRequest: null and doesn't work with the keyPrefix client in lib/redis.ts.
const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

export const VIRUS_SCAN_QUEUE_NAME = "virus-scan";

export const virusScanQueue = new Queue(VIRUS_SCAN_QUEUE_NAME, {
  connection,
  // Dev-scale retries so transient ClamAV or network errors don't strand a file in PENDING.
  defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
});

const fileRepo = new FileRepository();
const stepRepo = new FileVerificationStepRepository();

// The scan-and-transition logic split out of the Worker so it can be unit-tested without real BullMQ/Redis.
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
