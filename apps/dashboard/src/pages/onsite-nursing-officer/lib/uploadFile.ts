import { api } from "../../../lib/api";
import type { FileRecord } from "./types";

// Reads a file as a base64 string without the data: URL prefix.
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // FileReader returns "data:<mime>;base64,<payload>" and the API wants only the payload, with mimeType sent separately.
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// Uploads through POST /files/upload, the shared virus-scan pipeline; the record starts PENDING and is only real once the scan resolves.
export async function uploadFile(file: File, patientId: string): Promise<FileRecord> {
  const content = await fileToBase64(file);
  const res = await api.post<{ file: FileRecord }>("/files/upload", { patientId, mimeType: file.type || "application/octet-stream", content });
  return res.file;
}

// Polls GET /files/:id until the async ClamAV scan resolves, so the interlock and result screens rest on a real answer.
export async function pollScanStatus(fileId: string, opts: { intervalMs?: number; timeoutMs?: number } = {}): Promise<FileRecord> {
  const intervalMs = opts.intervalMs ?? 1500;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await api.get<{ file: FileRecord }>(`/files/${fileId}`).catch(async (err) => {
      // The 403 with an "infected" message is the scan result, not a polling failure.
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
