import { Router } from "express";
import {
  registerPatientHandler, getPatientHandler, getMyPatientHandler, searchPatientsHandler,
  updatePatientHandler, deletePatientHandler,
  createAddressHandler, createEmergencyContactHandler,
  getWalletHandler, getPatientTimelineHandler, listPendingRegistrationsHandler,
} from "./controller.js";
import { requirePermission, requireAuthenticated } from "../../lib/rbac.js";
import { validateBody, validateParams, validateQuery } from "../../lib/validation.js";
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
  // Self-editable only (see controller.ts SELF_EDITABLE_FIELDS) — accepted here regardless
  // of caller, the controller decides which fields actually apply.
  secondaryEmail: z.string().trim().email().optional(),
  profilePictureFileId: z.string().uuid().optional(),
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
  // "all" is the frontend's own sentinel for "no facility filter" (dashboard-wide pickers,
  // e.g. linking a public inquiry to a patient) — accepted alongside a real facility UUID
  // rather than requiring callers to omit the param entirely.
  facilityId: z.union([z.string().uuid(), z.literal("all")]).optional(),
  q: z.string().trim().min(1).max(128).optional(),
});

const walletQuerySchema = z.object({
  patientId: z.string().uuid(),
});

const router = Router();

// Not public: the only real caller (RegisterWizard, apps/web) creates a login account via
// POST /auth/register only — a Regional Admin reviews that submission and issues the Unique
// Patient ID from here (Design Spec §6.1's "confirm facility and issue ID" step). Letting any
// caller hit this directly would let a patient self-assign their own ID, bypassing approval.
router.post("/patients", requirePermission("patient", "create"), validateBody(registerPatientSchema), registerPatientHandler);
router.get("/patients/pending-registrations", requirePermission("patient", "create"), listPendingRegistrationsHandler);
router.get("/patients", requirePermission("patient", "read"), validateQuery(patientSearchQuerySchema), searchPatientsHandler);
// Must come before /patients/:id — otherwise Express would try to match "me" against the
// :id param (and validateParams' uuid check would reject it with a 400 before it ever reaches
// the handler that actually means to treat "me" specially).
router.get("/patients/me", requireAuthenticated(), getMyPatientHandler);
// requireAuthenticated, not requirePermission: reading/updating one's OWN record is a right,
// not a grant — the ownership-or-permission check lives in the controller (needs the record
// loaded first to know if it's "own"). See getPatientHandler/updatePatientHandler.
router.get("/patients/:id", requireAuthenticated(), validateParams(patientIdParamSchema), getPatientHandler);
router.put("/patients/:id", requireAuthenticated(), validateParams(patientIdParamSchema), validateBody(updatePatientSchema), updatePatientHandler);
router.get("/patients/:id/timeline", requireAuthenticated(), validateParams(patientIdParamSchema), getPatientTimelineHandler);
router.delete("/patients/:id", requirePermission("patient", "delete"), validateParams(patientIdParamSchema), deletePatientHandler);
router.post("/patients/:id/addresses", requirePermission("patient", "update"), validateParams(patientIdParamSchema), validateBody(createAddressSchema), createAddressHandler);
router.post("/patients/:id/emergency-contacts", requirePermission("patient", "update"), validateParams(patientIdParamSchema), validateBody(createEmergencyContactSchema), createEmergencyContactHandler);
// Same reasoning as GET /patients/:id — ownership-or-permission check lives in getWalletHandler.
router.get("/wallet", requireAuthenticated(), validateQuery(walletQuerySchema), getWalletHandler);

export { router as patientRoutes };
