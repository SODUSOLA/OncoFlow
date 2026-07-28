import crypto from "node:crypto";
import { db } from "../../db";
import { patient, wallet, patientTimeline } from "./schema";
import { PatientRepository } from "./repository";
import { Patient } from "./entities/Patient";
import { Wallet } from "./entities/Wallet";
import { PATIENT_TIMELINE_EVENT_TYPES } from "./entities/TimelineEvent";

const patientRepo = new PatientRepository();

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
}
