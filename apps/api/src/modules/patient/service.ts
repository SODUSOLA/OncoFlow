import crypto from "node:crypto";
import { db } from "../../db/index.js";
import { patient, wallet, patientTimeline } from "./schema.js";
import { PatientRepository, PatientRegistrationRequestRepository } from "./repository.js";
import { Patient } from "./entities/Patient.js";
import { Wallet } from "./entities/Wallet.js";
import { PATIENT_TIMELINE_EVENT_TYPES } from "./entities/TimelineEvent.js";
import { sendRegistrationConfirmedEmail } from "./services/RegistrationConfirmedEmailService.js";
// Facility is reference data (name for the confirmation email) — same read-only cross-module
// direction the billing module already takes on it, no cycle risk.
import { FacilityRepository } from "../facility/repository.js";

const patientRepo = new PatientRepository();
const registrationRequestRepo = new PatientRegistrationRequestRepository();
const facilityRepo = new FacilityRepository();

const UNIQUE_ID_GENERATION_ATTEMPTS = 5;

// Server-generated only — never accept a client-supplied ID (patient/routes.ts's own comment
// on why: it's the one thing a patient must never be able to choose for themselves). Used both
// by Admin's direct-entry POST /patients flow and by AuthService.verifyEmail's auto-registration
// (request #5) — same ID format (`OC-NNNNNN`) either way, just issued at a different moment.
export async function generateUniquePatientId(): Promise<string> {
  for (let attempt = 0; attempt < UNIQUE_ID_GENERATION_ATTEMPTS; attempt++) {
    const candidate = `OC-${crypto.randomInt(0, 1_000_000).toString().padStart(6, "0")}`;
    const existing = await patientRepo.findByUniqueId(candidate);
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique patient ID — please try again");
}

export class PatientService {
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

    // FR-01: same person, same facility, already has an active ID — reject before issuance
    // rather than creating a second ID and splitting their care timeline.
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

  // Request #5's other half: the patient record already exists and is fully usable by this
  // point (auto-created at email verification) — this is Admin confirming the self-reported
  // facility was right, optionally correcting it, and closing out onboarding. Idempotent-ish:
  // re-confirming an already-confirmed patient just refreshes the timestamp rather than erroring,
  // since there's no harm in it and no state to corrupt.
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

    // The registration request row is what drives Admin's pending queue — confirming is what
    // "handled" now means (it used to be approval/creation). Best-effort: the confirmation
    // itself already succeeded, and a stale queue row is a far smaller problem than failing
    // a completed confirmation.
    if (updated.userId) {
      await registrationRequestRepo.deleteByUserId(updated.userId).catch(() => {});
    }

    // Fire-and-forget, same tolerance as every other outbound mail in this codebase — it's
    // queued (BullMQ, with retries) rather than sent inline, so a transient vendor failure
    // doesn't need to fail the admin's request.
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
