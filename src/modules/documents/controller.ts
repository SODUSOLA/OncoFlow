import type { Request, Response } from "express";
import { FileService } from "./service";
import { FileRepository } from "./repository";

const fileSvc = new FileService();
const fileRepo = new FileRepository();

export async function uploadFileHandler(req: Request, res: Response) {
  try {
    const { patientId, mimeType, content } = req.body;
    if (!mimeType || !content) {
      res.status(400).json({ error: "mimeType and content (base64) are required" });
      return;
    }
    const uploadedBy = req.userId ?? "unknown";
    const buffer = Buffer.from(content as string, "base64");
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
    res.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "File not found") {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function listPatientFilesHandler(req: Request, res: Response) {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    if (!patientId) {
      res.status(400).json({ error: "patientId query parameter is required" });
      return;
    }
    const result = await fileSvc.findByPatient(patientId);
    res.json(result);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}
