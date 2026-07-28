import { Router } from "express";
import {
  registerPatientHandler, getPatientHandler, searchPatientsHandler,
  updatePatientHandler, deletePatientHandler,
  createAddressHandler, createEmergencyContactHandler,
  getWalletHandler,
} from "./controller";
import { requirePermission } from "../../lib/rbac";
import { validateBody, validateParams, validateQuery } from "../../lib/validation";
import { z } from "zod";

const patientIdParamSchema = z.object({
  id: z.string().uuid(),
});

const registerPatientSchema = z.object({
  uniquePatientId: z.string().trim().min(1).max(64),
  firstName: z.string().trim().min(1).max(128),
  lastName: z.string().trim().min(1).max(128),
  dob: z.string().trim().min(1).max(32),
  gender: z.string().trim().min(1).max(32),
  phone: z.string().trim().min(1).max(32),
  email: z.string().trim().email(),
  facilityId: z.string().uuid(),
  userId: z.string().uuid().optional(),
});

const updatePatientSchema = z.object({
  firstName: z.string().trim().min(1).max(128).optional(),
  lastName: z.string().trim().min(1).max(128).optional(),
  dob: z.string().trim().min(1).max(32).optional(),
  gender: z.string().trim().min(1).max(32).optional(),
  phone: z.string().trim().min(1).max(32).optional(),
  email: z.string().trim().email().optional(),
  status: z.string().trim().min(1).max(32).optional(),
});

const createAddressSchema = z.object({
  country: z.string().trim().min(1).max(128),
  state: z.string().trim().min(1).max(128),
  city: z.string().trim().min(1).max(128),
  address: z.string().trim().min(1).max(256),
});

const createEmergencyContactSchema = z.object({
  name: z.string().trim().min(1).max(128),
  relationship: z.string().trim().min(1).max(128),
  phone: z.string().trim().min(1).max(32),
});

const patientSearchQuerySchema = z.object({
  facilityId: z.string().uuid(),
  q: z.string().trim().min(1).max(128).optional(),
});

const walletQuerySchema = z.object({
  patientId: z.string().uuid(),
});

const router = Router();

router.post("/patients", validateBody(registerPatientSchema), registerPatientHandler);
router.get("/patients", requirePermission("patient", "read"), validateQuery(patientSearchQuerySchema), searchPatientsHandler);
router.get("/patients/:id", requirePermission("patient", "read"), validateParams(patientIdParamSchema), getPatientHandler);
router.put("/patients/:id", requirePermission("patient", "update"), validateParams(patientIdParamSchema), validateBody(updatePatientSchema), updatePatientHandler);
router.delete("/patients/:id", requirePermission("patient", "delete"), validateParams(patientIdParamSchema), deletePatientHandler);
router.post("/patients/:id/addresses", requirePermission("patient", "update"), validateParams(patientIdParamSchema), validateBody(createAddressSchema), createAddressHandler);
router.post("/patients/:id/emergency-contacts", requirePermission("patient", "update"), validateParams(patientIdParamSchema), validateBody(createEmergencyContactSchema), createEmergencyContactHandler);
router.get("/wallet", requirePermission("wallet", "read"), validateQuery(walletQuerySchema), getWalletHandler);

export { router as patientRoutes };
