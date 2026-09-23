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
import { resolveScopeOrDeny } from "../../lib/facility-scope.js";
// Cross-module read of the facility label, which this module doesn't own.
import { FacilityRepository } from "../facility/index.js";

const patientSvc = new PatientService();
const patientRepo = new PatientRepository();
const addressRepo = new AddressRepository();
const contactRepo = new EmergencyContactRepository();
const walletRepo = new WalletRepository();
const registrationRequestRepo = new PatientRegistrationRequestRepository();
const facilityRepo = new FacilityRepository();

// Registers a patient record, generating the Unique Patient ID server-side.
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

    // Marks the registration request fulfilled now that a linked patient exists; best-effort.
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

// The frontend's entry point for "who am I as a patient"; self-scoped by the caller's userId, so no ownership check is needed.
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
    // Resolves the facility name here so screens don't fetch the whole facility list for one label.
    const facilityRow = patientRow.facilityId ? await facilityRepo.findById(patientRow.facilityId) : null;

    res.json({
      patient: entity.toOwnJSON(),
      facility: facilityRow ? { id: facilityRow.id, name: facilityRow.name, region: facilityRow.region } : null,
      addresses: addresses.map((a) => ({ id: a.id, country: a.country, state: a.state, city: a.city, address: a.address })),
      emergencyContacts: contacts.map((c) => ({ id: c.id, name: c.name, relationship: c.relationship, phone: c.phone })),
      wallet: wallet ? new Wallet(wallet).toJSON() : null,
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Returns a patient record for its owner or staff with patient:read.
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

    // Authenticated only: reading your own record is a right, while another patient's record needs the staff permission.
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

// Searches patients within the caller's facility scope.
export async function searchPatientsHandler(req: Request, res: Response) {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;

    // The client-supplied ?facilityId is narrowed to the caller's real scope, closing the cross-hospital and "all" leak.
    const scope = await resolveScopeOrDeny(req, res, "patient");
    if (!scope) return;

    const patients = scope.kind === "unrestricted"
      ? await patientRepo.findAll()
      : await patientRepo.findByFacilityIds(scope.facilityIds);

    let filtered = patients;
    if (q) {
      const query = q.toLowerCase();
      // No phone matching, since searching by phone would let staff probe for a patient's number.
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
        // The phone is masked rather than omitted, so staff can recognize it without a side-channel.
        phoneMasked: maskPhone(p.phone),
      })),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Patients may self-edit only non-clinical fields (phone, second email, picture); staff with patient:update can correct the rest.
const SELF_EDITABLE_FIELDS = ["phone", "secondaryEmail", "profilePictureFileId"] as const;
const STAFF_EDITABLE_FIELDS = ["firstName", "lastName", "dob", "gender", "phone", "email", "status"] as const;

// Updates a patient's fields, limited for self-edits.
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
        // A cleared contact field arrives as "" and is stored as NULL so "unset" has one representation.
        const value = req.body[field];
        updates[field] = field === "secondaryEmail" && value === "" ? null : value;
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

// Soft-deletes a patient.
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

// Adds an address to a patient.
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

// Adds an emergency contact to a patient.
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

// Returns a patient's wallet (own or by permission).
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

// Exposes TimelineService, which had no HTTP route; it only reads, and recording entries is separate follow-up work.
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

// Gated on patient:call, so no ownership check; the raw number is passed to CallService server-side and never returned (FR-04).
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

// Gated on patient:create as the queue feeding facility confirmation; patientId is included since the record already exists.
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

// Confirms a patient's facility (Regional Admin onboarding step).
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
