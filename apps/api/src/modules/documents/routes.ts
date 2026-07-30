import { Router } from "express";
import { uploadFileHandler, getFileHandler, listPatientFilesHandler } from "./controller.js";
import { requirePermission } from "../../lib/rbac.js";
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

router.post("/files/upload", requirePermission("file", "create"), validateBody(uploadSchema), uploadFileHandler);
router.get("/files/:id", requirePermission("file", "read"), validateParams(fileIdParamSchema), getFileHandler);
router.get("/files", requirePermission("file", "read"), validateQuery(listFilesQuerySchema), listPatientFilesHandler);

export { router as documentRoutes };
