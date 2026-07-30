import type { Request, Response } from "express";
import crypto from "node:crypto";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { PatientService } from "./service.js";
import { PatientRepository, AddressRepository, EmergencyContactRepository, WalletRepository } from "./repository.js";
import { Patient } from "./entities/Patient.js";
import { Wallet } from "./entities/Wallet.js";

const patientSvc = new PatientService();
const patientRepo = new PatientRepository();
const addressRepo = new AddressRepository();
const contactRepo = new EmergencyContactRepository();
const walletRepo = new WalletRepository();

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

    const entity = new Patient(patientRow);
    const addresses = await addressRepo.findByPatient(patientRow.id);
    const contacts = await contactRepo.findByPatient(patientRow.id);
    const wallet = await walletRepo.findByPatient(patientRow.id);

    // FR-04: raw phone (own or an emergency contact's) only ever goes back to the patient
    // themselves — every staff role gets it masked, with no exception based on permissions.
    const isSelf = patientRow.userId !== null && patientRow.userId === (req as AuthenticatedRequest).userId;

    res.json({
      patient: isSelf ? entity.toOwnJSON() : entity.toJSON(),
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
    if (!facilityId) {
      res.status(400).json({ error: "facilityId query parameter required" });
      return;
    }

    const patients = await patientRepo.findByFacility(facilityId);

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
      })),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

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

    const allowedFields = ["firstName", "lastName", "dob", "gender", "phone", "email", "status"] as const;
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
    res.json({ patient: new Patient(updated!).toJSON() });
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
