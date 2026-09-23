import { Readable } from "node:stream";

// clamscan ships no TypeScript types — this is the minimal shape this file actually calls.
interface ClamScanInstance {
  scanStream(stream: Readable): Promise<{ isInfected: boolean | null; viruses: string[] }>;
}
interface NodeClamCtor {
  new (): { init(options: Record<string, unknown>): Promise<ClamScanInstance> };
}

let cached: ClamScanInstance | null = null;

// Reads config at call time and throws a clear "not configured" error rather than silently no-op-ing.
async function getClamScan(): Promise<ClamScanInstance> {
  if (cached) return cached;

  const host = process.env.CLAMAV_HOST ?? "";
  const port = process.env.CLAMAV_PORT ?? "";
  if (!host || !port) {
    throw new Error("ClamAV not configured. Set CLAMAV_HOST and CLAMAV_PORT");
  }

  const { default: NodeClam } = (await import("clamscan")) as unknown as { default: NodeClamCtor };
  cached = await new NodeClam().init({
    removeInfected: false,
    scanRecursively: false,
    clamdscan: {
      host,
      port: Number(port),
      timeout: 60_000,
      active: true,
    },
    clamscan: { active: false },
    preference: "clamdscan",
  });
  return cached;
}

// Scans a buffer with ClamAV and returns CLEAN or INFECTED.
export async function scanBuffer(buffer: Buffer): Promise<"CLEAN" | "INFECTED"> {
  const clamscan = await getClamScan();
  const { isInfected } = await clamscan.scanStream(Readable.from(buffer));
  return isInfected ? "INFECTED" : "CLEAN";
}

// Clears the cached scanner so tests can reconfigure it.
export function resetClamScanForTest(): void {
  cached = null;
}
