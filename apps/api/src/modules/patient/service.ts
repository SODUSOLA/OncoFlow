import crypto from "node:crypto";
import { db } from "../../db/index.js";
import { patient, wallet, patientTimeline } from "./schema.js";
import { PatientRepository, PatientRegistrationRequestRepository } from "./repository.js";
import { Patient } from "./entities/Patient.js";
import { Wallet } from "./entities/Wallet.js";
import { PATIENT_TIMELINE_EVENT_TYPES } from "./entities/TimelineEvent.js";
import { sendRegistrationConfirmedEmail } from "./services/RegistrationConfirmedEmailService.js";
// Read-only cross-module use of facility reference data for the confirmation email; no cycle risk.
import { FacilityRepository } from "../facility/repository.js";

const patientRepo = new PatientRepository();
const registrationRequestRepo = new PatientRegistrationRequestRepository();
const facilityRepo = new FacilityRepository();

const UNIQUE_ID_GENERATION_ATTEMPTS = 5;

// Server-generated OC-NNNNNN ID, never client-supplied, used by both admin registration and email-verification auto-registration.
export async function generateUniquePatientId(): Promise<string> {
  for (let attempt = 0; attempt < UNIQUE_ID_GENERATION_ATTEMPTS; attempt++) {
    const candidate = `OC-${crypto.randomInt(0, 1_000_000).toString().padStart(6, "0")}`;
    const existing = await patientRepo.findByUniqueId(candidate);
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique patient ID — please try again");
}

// Business logic for patient registration and facility confirmation.
export class PatientService {
  // Registers a patient with a server-issued ID and creates their wallet.
  async registerPatient(data: {
    uniquePatientId: string;
    firstName: string;
    lastName: string;
    dob: string;
    gender: string;
    phone: string;
    email: string;
    facilityId: string;
    userId?: string;
  }) {
    const existing = await patientRepo.findByUniqueId(data.uniquePatientId);
    if (existing) {
      throw new Error("Patient with this ID already exists");
    }

    // FR-01: rejects a duplicate before issuing an ID so a person's care timeline isn't split.
    const duplicate = await patientRepo.findPotentialDuplicate(data.firstName, data.lastName, data.dob, data.facilityId);
    if (duplicate) {
      throw new Error("It looks like you may already have an account");
    }

    const result = await db.transaction(async (tx) => {
      const patientRows = await tx.insert(patient).values({
        id: crypto.randomUUID(),
        uniquePatientId: data.uniquePatientId,
        userId: data.userId ?? null,
        firstName: data.firstName,
        lastName: data.lastName,
        dob: data.dob,
        gender: data.gender,
        phone: data.phone,
        email: data.email,
        facilityId: data.facilityId,
        status: "ACTIVE",
      }).returning();

      const patientRow = patientRows[0]!;
      const walletRows = await tx.insert(wallet).values({
        id: crypto.randomUUID(),
        patientId: patientRow.id,
        balanceKobo: 0n,
      }).returning();

      await tx.insert(patientTimeline).values({
        id: crypto.randomUUID(),
        patientId: patientRow.id,
        eventType: PATIENT_TIMELINE_EVENT_TYPES.REGISTRATION,
        referenceId: patientRow.id,
      });

      return { patientRow, walletRow: walletRows[0]! };
    });

    return {
      patient: new Patient(result.patientRow),
      wallet: new Wallet(result.walletRow),
    };
  }

  // Admin confirms or corrects the self-reported facility on an already-live record; re-confirming just refreshes the timestamp.
  async confirmFacility(patientId: string, facilityId?: string) {
    const patientRow = await patientRepo.findById(patientId);
    if (!patientRow) {
      throw new Error("Patient not found");
    }

    const updated = await patientRepo.update(patientId, {
      facilityConfirmedAt: new Date(),
      ...(facilityId ? { facilityId } : {}),
    });
    if (!updated) {
      throw new Error("Patient not found");
    }

    // Removes the registration request that drives Admin's queue; best-effort since the confirmation already succeeded.
    if (updated.userId) {
      await registrationRequestRepo.deleteByUserId(updated.userId).catch(() => {});
    }

    // Queues the confirmation email (with retries) instead of sending inline, so a vendor failure can't fail the request.
    const facilityRow = await facilityRepo.findById(updated.facilityId);
    void sendRegistrationConfirmedEmail(
      updated.email,
      `${updated.firstName} ${updated.lastName}`,
      updated.uniquePatientId,
      facilityRow?.name ?? "your assigned facility",
    ).catch((err: unknown) => {
      console.error(`Registration-confirmed email failed for patient ${patientId}:`, err);
    });

    return new Patient(updated);
  }
}
