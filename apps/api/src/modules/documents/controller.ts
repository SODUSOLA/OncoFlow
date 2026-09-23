import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { userHasPermission } from "../../lib/rbac.js";
import { FileService } from "./service.js";
// Cross-module read to check whether a file's patient is the caller's own record before falling back to staff grants.
import { PatientRepository } from "../patient/index.js";
import { config } from "../../config.js";

const fileSvc = new FileService();
const patientRepo = new PatientRepository();

// True when the patient record belongs to the caller.
async function callerOwnsPatient(callerId: string, patientId: string): Promise<boolean> {
  const patientRow = await patientRepo.findById(patientId);
  return !!patientRow?.userId && patientRow.userId === callerId;
}

// Uploads a file (base64 JSON), stores it in R2 and queues a virus scan.
export async function uploadFileHandler(req: Request, res: Response) {
  try {
    const { patientId, mimeType, content } = req.body;
    if (!mimeType || !content) {
      res.status(400).json({ error: "mimeType and content (base64) are required" });
      return;
    }
    const uploadedBy = (req as AuthenticatedRequest).userId;

    // A file with no patient is a staff or system upload needing file:create; a patient's own file needs only ownership.
    if (patientId) {
      const isSelf = await callerOwnsPatient(uploadedBy, patientId);
      if (!isSelf && !(await userHasPermission(uploadedBy, "file", "create"))) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    } else if (!(await userHasPermission(uploadedBy, "file", "create"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const buffer = Buffer.from(content as string, "base64");
    // Checked on decoded bytes so the limit is accurate and the error can name the real file limit, independent of the parser's budget.
    if (buffer.byteLength > config.maxUploadBytes) {
      const limitMb = (config.maxUploadBytes / (1024 * 1024)).toFixed(0);
      res.status(413).json({
        error: `File is too large — the maximum upload size is ${limitMb}MB`,
        code: "PAYLOAD_TOO_LARGE",
      });
      return;
    }

    const result = await fileSvc.upload({ patientId, uploadedBy, mimeType, content: buffer });
    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("not configured") ? 502 : 500;
    res.status(status).json({ error: message });
  }
}

// Returns a file's metadata, blocked once it is flagged infected.
export async function getFileHandler(req: Request, res: Response) {
  try {
    const result = await fileSvc.findById(String(req.params.id));

    const callerId = (req as AuthenticatedRequest).userId;
    const isSelf = !!result.file.patientId && await callerOwnsPatient(callerId, result.file.patientId);
    if (!isSelf && !(await userHasPermission(callerId, "file", "read"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // F4.6: an infected file is blocked unconditionally, since no reviewer-override role exists.
    if (result.file.virusScanStatus === "INFECTED") {
      res.status(403).json({ error: "File blocked: flagged as infected, pending review" });
      return;
    }

    res.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "File not found") {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
}

// Serves the file bytes: same authorization as the metadata route, then a fresh short-TTL signed R2 redirect, never a public bucket link.
export async function downloadFileHandler(req: Request, res: Response) {
  try {
    const result = await fileSvc.findById(String(req.params.id));

    const callerId = (req as AuthenticatedRequest).userId;
    const isSelf = !!result.file.patientId && await callerOwnsPatient(callerId, result.file.patientId);
    if (!isSelf && !(await userHasPermission(callerId, "file", "read"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // The same F4.6 block applies here so the infected flag isn't cosmetic while the bytes stay fetchable.
    if (result.file.virusScanStatus === "INFECTED") {
      res.status(403).json({ error: "File blocked: flagged as infected, pending review" });
      return;
    }

    // ?download=true forces an attachment (save dialog) instead of inline rendering.
    const forceDownload = req.query.download === "true";
    const url = await fileSvc.getSignedUrl(result.file, { forceDownload });

    // Never cached, so every access re-runs authorization and mints a fresh signed URL.
    res.set("Cache-Control", "no-store");
    res.redirect(url);
  } catch (err) {
    if (err instanceof Error && err.message === "File not found") {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("not configured") ? 502 : 500;
    res.status(status).json({ error: message });
  }
}

// Lists a patient's files (own for patients, permission for staff).
export async function listPatientFilesHandler(req: Request, res: Response) {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    if (!patientId) {
      res.status(400).json({ error: "patientId query parameter is required" });
      return;
    }

    const callerId = (req as AuthenticatedRequest).userId;
    const isSelf = await callerOwnsPatient(callerId, patientId);
    if (!isSelf && !(await userHasPermission(callerId, "file", "read"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const result = await fileSvc.findByPatient(patientId);
    res.json(result);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}
