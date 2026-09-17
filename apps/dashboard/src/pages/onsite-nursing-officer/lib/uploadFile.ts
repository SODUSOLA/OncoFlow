import { api } from "../../../lib/api";
import type { FileRecord } from "./types";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // FileReader's data: URL is "data:<mime>;base64,<payload>" — the API only wants the
      // payload, mimeType is sent separately.
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// Real upload against POST /files/upload — the same file table + virus-scan pipeline every
// other upload in this app goes through (apps/api/src/modules/documents). No client-only
// "looks uploaded" state: the returned record starts PENDING and only becomes real once the
// scan resolves (see pollScanStatus below).
export async function uploadFile(file: File, patientId: string): Promise<FileRecord> {
  const content = await fileToBase64(file);
  const res = await api.post<{ file: FileRecord }>("/files/upload", { patientId, mimeType: file.type || "application/octet-stream", content });
  return res.file;
}

// Scanning is asynchronous (a BullMQ-queued ClamAV job) — this polls the same GET /files/:id
// every other file consumer in this app uses, until the scan actually resolves. No fixed delay
// stands in for a real result: Step 5's safety interlock and the wizard's Success/Error screens
// depend on this being the real answer, not a guess.
export async function pollScanStatus(fileId: string, opts: { intervalMs?: number; timeoutMs?: number } = {}): Promise<FileRecord> {
  const intervalMs = opts.intervalMs ?? 1500;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await api.get<{ file: FileRecord }>(`/files/${fileId}`).catch(async (err) => {
      // getFileHandler returns 403 with a specific message once a file is flagged INFECTED —
      // that's not a failure to poll, it's the answer.
      if (err instanceof Error && err.message.includes("infected")) {
        return { file: { id: fileId, virusScanStatus: "INFECTED" as const } as FileRecord };
      }
      throw err;
    });
    if (res.file.virusScanStatus !== "PENDING") return res.file;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Safety scan is taking longer than expected — try again shortly");
}
