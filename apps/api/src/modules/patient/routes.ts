import { Router } from "express";
import {
  registerPatientHandler, getPatientHandler, getMyPatientHandler, searchPatientsHandler,
  updatePatientHandler, deletePatientHandler,
  createAddressHandler, createEmergencyContactHandler,
  getWalletHandler, setAutoDeductHandler, getPatientTimelineHandler, listPendingRegistrationsHandler,
  callPatientHandler, confirmFacilityHandler,
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

// facilityId is optional: omitted confirms the self-reported choice, supplied reassigns the patient to another facility.
const confirmFacilitySchema = z.object({
  facilityId: z.string().uuid().optional(),
});

const updatePatientSchema = z.object({
  firstName: z.string().trim().min(1).max(128).optional(),
  lastName: z.string().trim().min(1).max(128).optional(),
  dob: z.string().trim().min(1).max(32).optional(),
  gender: z.string().trim().min(1).max(32).optional(),
  phone: z.string().trim().min(1).max(32).optional(),
  email: z.string().trim().email().optional(),
  status: z.string().trim().min(1).max(32).optional(),
  // Self-editable only, but "" is accepted so the field can be cleared; the controller stores it as NULL.
  secondaryEmail: z.union([z.string().trim().email(), z.literal("")]).optional(),
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
  // "all" is the frontend's no-filter sentinel, accepted alongside a facility UUID.
  facilityId: z.union([z.string().uuid(), z.literal("all")]).optional(),
  q: z.string().trim().min(1).max(128).optional(),
});

const walletQuerySchema = z.object({
  patientId: z.string().uuid(),
});

const autoDeductSchema = z.object({ enabled: z.boolean() });

const router = Router();

// Not public: Admin issues the Unique Patient ID after reviewing a registration, so callers can't self-assign one.
router.post("/patients", requirePermission("patient", "create"), validateBody(registerPatientSchema), registerPatientHandler);
// Queue of registrations awaiting facility confirmation.
router.get("/patients/pending-registrations", requirePermission("patient", "create"), listPendingRegistrationsHandler);
// Searches patients within the caller's scope.
router.get("/patients", requirePermission("patient", "read"), validateQuery(patientSearchQuerySchema), searchPatientsHandler);
// Must precede /patients/:id or "me" would fail the uuid param check.
router.get("/patients/me", requireAuthenticated(), getMyPatientHandler);
// Authenticated only, since reading your own record is a right; the ownership check is in the controller.
router.get("/patients/:id", requireAuthenticated(), validateParams(patientIdParamSchema), getPatientHandler);
// Updates a patient (self-edit is limited to non-clinical fields).
router.put("/patients/:id", requireAuthenticated(), validateParams(patientIdParamSchema), validateBody(updatePatientSchema), updatePatientHandler);
// Reads a patient's timeline.
router.get("/patients/:id/timeline", requireAuthenticated(), validateParams(patientIdParamSchema), getPatientTimelineHandler);
// Soft-deletes a patient.
router.delete("/patients/:id", requirePermission("patient", "delete"), validateParams(patientIdParamSchema), deletePatientHandler);
// Adds an address.
router.post("/patients/:id/addresses", requirePermission("patient", "update"), validateParams(patientIdParamSchema), validateBody(createAddressSchema), createAddressHandler);
// Adds an emergency contact.
router.post("/patients/:id/emergency-contacts", requirePermission("patient", "update"), validateParams(patientIdParamSchema), validateBody(createEmergencyContactSchema), createEmergencyContactHandler);
// Places a masked call for Regional Admin or Onsite Nursing Officer only, never returning the raw number.
router.post("/patients/:id/call", requirePermission("patient", "call"), validateParams(patientIdParamSchema), callPatientHandler);
// Staff-only, since a patient confirming their own facility would defeat the review step.
router.patch("/patients/:id/confirm-facility", requirePermission("patient", "update"), validateParams(patientIdParamSchema), validateBody(confirmFacilitySchema), confirmFacilityHandler);
// Same reasoning as GET /patients/:id — ownership-or-permission check lives in getWalletHandler.
router.get("/wallet", requireAuthenticated(), validateQuery(walletQuerySchema), getWalletHandler);
// A patient's own preference, so it needs a session rather than a grant; the handler only ever touches the caller's wallet.
router.put("/wallet/auto-deduct", requireAuthenticated(), validateBody(autoDeductSchema), setAutoDeductHandler);

export { router as patientRoutes };
