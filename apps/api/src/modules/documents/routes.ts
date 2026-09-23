import { Router } from "express";
import { uploadFileHandler, getFileHandler, downloadFileHandler, listPatientFilesHandler } from "./controller.js";
import { requireAuthenticated } from "../../lib/rbac.js";
import { validateBody, validateParams, validateQuery } from "../../lib/validation.js";
import { z } from "zod";

const uploadSchema = z.object({
  patientId: z.string().uuid().optional(),
  mimeType: z.string().min(1).max(100),
  content: z.string().min(1),
});

const fileIdParamSchema = z.object({
  id: z.string().uuid(),
});

const listFilesQuerySchema = z.object({
  patientId: z.string().uuid(),
});

const router = Router();

// Authenticated only, since patients uploading or reading their own files is a right; ownership is checked in the controller.
router.post("/files/upload", requireAuthenticated(), validateBody(uploadSchema), uploadFileHandler);
// Reads a file's metadata.
router.get("/files/:id", requireAuthenticated(), validateParams(fileIdParamSchema), getFileHandler);
// Separate from the metadata route because <img> and <a> tags hit it directly and expect a redirect to bytes.
router.get("/files/:id/content", requireAuthenticated(), validateParams(fileIdParamSchema), downloadFileHandler);
// Lists a patient's files.
router.get("/files", requireAuthenticated(), validateQuery(listFilesQuerySchema), listPatientFilesHandler);

export { router as documentRoutes };
