import { Router } from "express";
import { uploadFileHandler, getFileHandler, listPatientFilesHandler } from "./controller.js";
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

// requireAuthenticated, not requirePermission: a patient uploading/reading their OWN files
// (e.g. their own lab results) is a right, not a grant — the ownership-or-permission check
// lives in the controller (callerOwnsPatient), which needs the record loaded first.
router.post("/files/upload", requireAuthenticated(), validateBody(uploadSchema), uploadFileHandler);
router.get("/files/:id", requireAuthenticated(), validateParams(fileIdParamSchema), getFileHandler);
router.get("/files", requireAuthenticated(), validateQuery(listFilesQuerySchema), listPatientFilesHandler);

export { router as documentRoutes };
