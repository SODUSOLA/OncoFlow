import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { userHasPermission } from "../../lib/rbac.js";
import { FileService } from "./service.js";
// Cross-module read (same pattern as clinical/controller.ts and messaging/service.ts) — needed
// to check "is this file's/query's patientId the caller's own patient record" (Patient role
// spec: "can upload own labs") before falling back to the staff-level file:create/read grant.
import { PatientRepository } from "../patient/index.js";
import { config } from "../../config.js";

const fileSvc = new FileService();
const patientRepo = new PatientRepository();

async function callerOwnsPatient(callerId: string, patientId: string): Promise<boolean> {
  const patientRow = await patientRepo.findById(patientId);
  return !!patientRow?.userId && patientRow.userId === callerId;
}

export async function uploadFileHandler(req: Request, res: Response) {
  try {
    const { patientId, mimeType, content } = req.body;
    if (!mimeType || !content) {
      res.status(400).json({ error: "mimeType and content (base64) are required" });
      return;
    }
    const uploadedBy = (req as AuthenticatedRequest).userId;

    // A file not tied to any patient (patientId omitted) is a staff/system upload — that
    // still needs the file:create permission. A patient uploading their own file (e.g. a lab
    // result) doesn't need a blanket grant, only ownership of the patientId they're attaching it to.
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
    // Checked on the decoded bytes, not the base64 string, so the limit means what it says.
    // The body parser also caps the request (app.ts), but that produces a generic
    // "body too large" about the envelope; this is the one that can name the actual file limit,
    // and it keeps the rule intact if the parser budget is ever raised independently.
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

export async function getFileHandler(req: Request, res: Response) {
  try {
    const result = await fileSvc.findById(String(req.params.id));

    const callerId = (req as AuthenticatedRequest).userId;
    const isSelf = !!result.file.patientId && await callerOwnsPatient(callerId, result.file.patientId);
    if (!isSelf && !(await userHasPermission(callerId, "file", "read"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // F4.6: block the file from being served once flagged infected — no reviewer-override
    // role exists in this codebase, so this blocks unconditionally rather than half-gating it
    // behind a permission nobody has been granted.
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

// Serves the actual bytes. GET /files/:id only ever returned metadata — storage_key, mime
// type, scan status — and nothing in the codebase read the object back out of R2 except the
// virus-scan worker, so an uploaded avatar or lab document had no way to reach a browser at
// all. This runs the exact same authorization as getFileHandler (ownership-or-permission,
// then the infected-file block) before minting a fresh, short-TTL signed URL and redirecting
// to it — never a public bucket link, per docs/build-plan/10-security-gates.md Gate 6.
export async function downloadFileHandler(req: Request, res: Response) {
  try {
    const result = await fileSvc.findById(String(req.params.id));

    const callerId = (req as AuthenticatedRequest).userId;
    const isSelf = !!result.file.patientId && await callerOwnsPatient(callerId, result.file.patientId);
    if (!isSelf && !(await userHasPermission(callerId, "file", "read"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Same F4.6 rule as getFileHandler: an infected file is blocked outright, not just hidden
    // from the metadata response — otherwise the flag would be cosmetic while the bytes stayed
    // fetchable through this route.
    if (result.file.virusScanStatus === "INFECTED") {
      res.status(403).json({ error: "File blocked: flagged as infected, pending review" });
      return;
    }

    // ?download=true asks for Content-Disposition: attachment (a save dialog) instead of
    // letting the browser render the file inline — useful for a lab PDF, wrong default for an
    // avatar `<img>` or an inline chat image.
    const forceDownload = req.query.download === "true";
    const url = await fileSvc.getSignedUrl(result.file, { forceDownload });

    // Never cached: per Gate 6, every access mints a fresh signed URL after a fresh
    // authorization check, not a URL an intermediary could hand out again without that check
    // re-running.
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
