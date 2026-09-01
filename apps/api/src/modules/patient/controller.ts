import type { Request, Response } from "express";
import crypto from "node:crypto";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { userHasPermission } from "../../lib/rbac.js";
import { PatientService } from "./service.js";
import {
  PatientRepository, AddressRepository, EmergencyContactRepository, WalletRepository,
  PatientRegistrationRequestRepository,
} from "./repository.js";
import { Patient } from "./entities/Patient.js";
import { Wallet } from "./entities/Wallet.js";
import { timelineService } from "./services/TimelineService.js";
import { placeCall } from "./services/CallService.js";
import { maskPhone } from "../../lib/maskPhone.js";
import { accessibleFacilityIds, resolveRequestedFacilityScope } from "../../lib/facility-scope.js";
import { auditService } from "../audit/index.js";

const patientSvc = new PatientService();
const patientRepo = new PatientRepository();
const addressRepo = new AddressRepository();
const contactRepo = new EmergencyContactRepository();
const walletRepo = new WalletRepository();
const registrationRequestRepo = new PatientRegistrationRequestRepository();

export async function registerPatientHandler(req: Request, res: Response) {
  try {
    const { uniquePatientId, firstName, lastName, dob, gender, phone, email, facilityId, userId } = req.body;
    if (!uniquePatientId || !firstName || !lastName || !dob || !gender || !phone || !email || !facilityId) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const result = await patientSvc.registerPatient({
      uniquePatientId,
      firstName,
      lastName,
      dob,
      gender,
      phone,
      email,
      facilityId,
      userId,
    });

    // This request is now fulfilled — a linked patient exists, so it should stop showing up
    // as pending. Best-effort: the patient record is already created either way.
    if (userId) {
      await registrationRequestRepo.deleteByUserId(userId).catch(() => {});
    }

    res.status(201).json({
      patient: result.patient.toJSON(),
      wallet: result.wallet.toJSON(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const isDuplicate = message === "Patient with this ID already exists" || message === "It looks like you may already have an account";
    res.status(isDuplicate ? 409 : 400).json({ error: message });
  }
}

// The frontend's own entry point: "who am I, as a patient" — every other patient endpoint
// needs a patientId the caller already knows, but a freshly-logged-in patient doesn't have
// one yet without this. Inherently self-scoped by definition (looks up by the caller's own
// userId), so no ownership check needed beyond requireAuthenticated() on the route.
export async function getMyPatientHandler(req: Request, res: Response) {
  try {
    const callerId = (req as AuthenticatedRequest).userId;
    const patientRow = await patientRepo.findByUserId(callerId);
    if (!patientRow) {
      res.status(404).json({ error: "No patient record linked to this account" });
      return;
    }

    const entity = new Patient(patientRow);
    const addresses = await addressRepo.findByPatient(patientRow.id);
    const contacts = await contactRepo.findByPatient(patientRow.id);
    const wallet = await walletRepo.findByPatient(patientRow.id);

    res.json({
      patient: entity.toOwnJSON(),
      addresses: addresses.map((a) => ({ id: a.id, country: a.country, state: a.state, city: a.city, address: a.address })),
      emergencyContacts: contacts.map((c) => ({ id: c.id, name: c.name, relationship: c.relationship, phone: c.phone })),
      wallet: wallet ? new Wallet(wallet).toJSON() : null,
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getPatientHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Patient ID required" });
      return;
    }
    const patientRow = await patientRepo.findById(String(id));
    if (!patientRow) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    // The route only requires being authenticated (requireAuthenticated()), not a blanket
    // patient:read grant — a patient reading their OWN record is a right, not a permission.
    // Reading someone else's record still needs the staff-level permission. Without this check,
    // any authenticated caller could fetch any patient by ID — "cannot view any other patient's
    // data, under any circumstance" isn't actually true without it.
    const callerId = (req as AuthenticatedRequest).userId;
    const isSelf = patientRow.userId !== null && patientRow.userId === callerId;
    if (!isSelf && !(await userHasPermission(callerId, "patient", "read"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const entity = new Patient(patientRow);
    const addresses = await addressRepo.findByPatient(patientRow.id);
    const contacts = await contactRepo.findByPatient(patientRow.id);
    const wallet = await walletRepo.findByPatient(patientRow.id);

    res.json({
      patient: isSelf ? entity.toOwnJSON() : { ...entity.toJSON(), phoneMasked: maskPhone(patientRow.phone) },
      addresses: addresses.map((a) => ({ id: a.id, country: a.country, state: a.state, city: a.city, address: a.address })),
      emergencyContacts: contacts.map((c) => ({
        id: c.id, name: c.name, relationship: c.relationship,
        ...(isSelf ? { phone: c.phone } : {}),
      })),
      wallet: wallet ? new Wallet(wallet).toJSON() : null,
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function searchPatientsHandler(req: Request, res: Response) {
  try {
    const facilityId = typeof req.query.facilityId === "string" ? req.query.facilityId : undefined;
    const q = typeof req.query.q === "string" ? req.query.q : undefined;

    // `?facilityId` is client-supplied and therefore untrusted: it is narrowed against what
    // this caller may actually see (lib/facility-scope.ts) rather than used as the filter
    // directly. Before this, `?facilityId=all` returned every patient on the platform and an
    // explicit id let one hospital's staff read another hospital's patients.
    const scope = resolveRequestedFacilityScope(
      facilityId,
      await accessibleFacilityIds((req as AuthenticatedRequest).userId),
    );
    if (scope.kind === "forbidden") {
      // Best-effort, same tolerance as rbac.ts's own audit calls — a logging failure must not
      // turn a correct 403 into a 500.
      await auditService.recordEvent({
        actorId: (req as AuthenticatedRequest).userId,
        action: "ACCESS_DENIED", resource: "patient", result: "DENIED", ip: req.ip,
      }).catch(() => {});
      res.status(403).json({ error: "Forbidden: facility outside your scope" });
      return;
    }

    const patients = scope.kind === "unrestricted"
      ? await patientRepo.findAll()
      : (await Promise.all(scope.facilityIds.map((id) => patientRepo.findByFacility(id)))).flat();

    let filtered = patients;
    if (q) {
      const query = q.toLowerCase();
      // Deliberately no phone match here — this is a staff-facing search (FR-04), and even
      // using phone as a search key without displaying it back is a side-channel for staff
      // to probe for/confirm a patient's number.
      filtered = patients.filter(
        (p) =>
          p.firstName.toLowerCase().includes(query) ||
          p.lastName.toLowerCase().includes(query) ||
          p.uniquePatientId.toLowerCase().includes(query),
      );
    }

    res.json({
      patients: filtered.map((p) => ({
        id: p.id,
        uniquePatientId: p.uniquePatientId,
        firstName: p.firstName,
        lastName: p.lastName,
        gender: p.gender,
        status: p.status,
        facilityId: p.facilityId,
        // Masked, not omitted — safe for Admin-scoped staff to see enough to recognize a
        // number without it becoming the side-channel the unmasked field would be (see the
        // comment on the `q` filter above).
        phoneMasked: maskPhone(p.phone),
      })),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Self-edits are scoped to non-clinical fields only (per the Patient role spec: "can edit own
// profile — non-clinical fields i.e. second email, PP, and phone number"). Staff with
// patient:update can correct any of the fields below; a patient editing their own record
// cannot touch identity/clinical-adjacent fields like name, DOB, gender, or status.
const SELF_EDITABLE_FIELDS = ["phone", "secondaryEmail", "profilePictureFileId"] as const;
const STAFF_EDITABLE_FIELDS = ["firstName", "lastName", "dob", "gender", "phone", "email", "status"] as const;

export async function updatePatientHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Patient ID required" });
      return;
    }
    const existing = await patientRepo.findById(String(id));
    if (!existing) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    const callerId = (req as AuthenticatedRequest).userId;
    const isSelf = existing.userId !== null && existing.userId === callerId;

    let allowedFields: readonly string[];
    if (isSelf) {
      allowedFields = SELF_EDITABLE_FIELDS;
    } else {
      if (!(await userHasPermission(callerId, "patient", "update"))) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      allowedFields = STAFF_EDITABLE_FIELDS;
    }

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    const updated = await patientRepo.update(String(id), updates);
    res.json({ patient: isSelf ? new Patient(updated!).toOwnJSON() : new Patient(updated!).toJSON() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function deletePatientHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Patient ID required" });
      return;
    }
    const existing = await patientRepo.findById(String(id));
    if (!existing) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    await patientRepo.softDelete(String(id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function createAddressHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Patient ID required" });
      return;
    }
    const existing = await patientRepo.findById(String(id));
    if (!existing) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    const { country, state, city, address } = req.body;
    if (!country || !state || !city || !address) {
      res.status(400).json({ error: "Missing required address fields" });
      return;
    }

    const addr = await addressRepo.create({
      id: crypto.randomUUID(),
      patientId: String(id),
      country,
      state,
      city,
      address,
    });

    res.status(201).json({ address: { id: addr.id, country: addr.country, state: addr.state, city: addr.city, address: addr.address } });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function createEmergencyContactHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Patient ID required" });
      return;
    }
    const existing = await patientRepo.findById(String(id));
    if (!existing) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    const { name, relationship, phone } = req.body;
    if (!name || !relationship || !phone) {
      res.status(400).json({ error: "Missing required contact fields" });
      return;
    }

    const contact = await contactRepo.create({
      id: crypto.randomUUID(),
      patientId: String(id),
      name,
      relationship,
      phone,
    });

    res.status(201).json({
      emergencyContact: { id: contact.id, name: contact.name, relationship: contact.relationship, phone: contact.phone },
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getWalletHandler(req: Request, res: Response) {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    if (!patientId) {
      res.status(400).json({ error: "patientId query parameter required" });
      return;
    }

    const patientRow = await patientRepo.findById(patientId);
    if (!patientRow) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    const callerId = (req as AuthenticatedRequest).userId;
    const isSelf = patientRow.userId !== null && patientRow.userId === callerId;
    if (!isSelf && !(await userHasPermission(callerId, "wallet", "read"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const w = await walletRepo.findByPatient(patientId);
    if (!w) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }
    res.json({ wallet: new Wallet(w).toJSON() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// TimelineService itself has existed since earlier (F0.x) but had no HTTP route at all — this
// closes that gap. Recording entries into it (on invoice/appointment/consultation events) is
// separate, not-yet-wired follow-up work; this endpoint only reads whatever's there.
export async function getPatientTimelineHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Patient ID required" });
      return;
    }
    const patientRow = await patientRepo.findById(String(id));
    if (!patientRow) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    const callerId = (req as AuthenticatedRequest).userId;
    const isSelf = patientRow.userId !== null && patientRow.userId === callerId;
    if (!isSelf && !(await userHasPermission(callerId, "patient", "read"))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const events = await timelineService.getByPatient(String(id));
    res.json({
      events: events.map((e) => ({
        id: e.id, eventType: e.eventType, referenceId: e.referenceId, createdAt: e.createdAt,
      })),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Route is already gated on patient:call (Regional Admin / Onsite Nursing Officer only, see
// routes.ts + seed/identity.ts) — no further ownership/permission check needed here. The raw
// phone number is read server-side to hand to CallService and is never put in the response
// body (FR-04 / Data Classification §8 — same restriction Patient.toJSON() already enforces
// for every other staff-facing response).
export async function callPatientHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Patient ID required" });
      return;
    }
    const patientRow = await patientRepo.findById(String(id));
    if (!patientRow) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    const result = await placeCall(patientRow.id, patientRow.phone);
    res.status(201).json({ callSessionId: result.callSessionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("not configured") ? 502 : 500;
    res.status(status).json({ error: message });
  }
}

// Gated on patient:create, not patient:read — this is the queue that feeds the facility
// confirmation action (PATCH /patients/:id/confirm-facility), not general record browsing.
// The patient record itself already exists by the time a row shows up here (auto-created at
// email verification); `patientId` is included so the confirm action has something to target.
export async function listPendingRegistrationsHandler(_req: Request, res: Response) {
  try {
    const rows = await registrationRequestRepo.findAllPending();
    const withPatientIds = await Promise.all(
      rows.map(async (row) => {
        const patientRow = await patientRepo.findByUserId(row.userId);
        return {
          id: row.id,
          userId: row.userId,
          patientId: patientRow?.id ?? null,
          uniquePatientId: patientRow?.uniquePatientId ?? null,
          fullName: row.fullName,
          dob: row.dob,
          gender: row.gender,
          phone: row.phone,
          email: row.email,
          preferredFacilityId: row.preferredFacilityId,
          createdAt: row.createdAt.toISOString(),
        };
      }),
    );
    res.json({ registrations: withPatientIds });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function confirmFacilityHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Patient ID required" });
      return;
    }
    const { facilityId } = req.body ?? {};
    const updated = await patientSvc.confirmFacility(String(id), facilityId);
    res.json({ patient: updated.toJSON() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(message === "Patient not found" ? 404 : 400).json({ error: message });
  }
}
