import type { patientStatusEnum } from "../../../db/enums.js";

type PatientStatus = (typeof patientStatusEnum.enumValues)[number];

export interface PatientData {
  id: string;
  uniquePatientId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  phone: string;
  email: string;
  status: PatientStatus;
  facilityId: string;
}

export class Patient {
  constructor(private data: PatientData) {}

  get id() { return this.data.id; }
  get uniquePatientId() { return this.data.uniquePatientId; }
  get userId() { return this.data.userId; }
  get firstName() { return this.data.firstName; }
  get lastName() { return this.data.lastName; }
  get fullName() { return `${this.data.firstName} ${this.data.lastName}`; }
  get email() { return this.data.email; }
  get status() { return this.data.status; }
  get facilityId() { return this.data.facilityId; }

  // FR-04 / Data Classification §8: phone is Restricted — never rendered to a staff-facing
  // response, under any circumstance, regardless of that staff member's role or permissions.
  toJSON() {
    return {
      id: this.data.id,
      uniquePatientId: this.data.uniquePatientId,
      userId: this.data.userId,
      firstName: this.data.firstName,
      lastName: this.data.lastName,
      dob: this.data.dob,
      gender: this.data.gender,
      email: this.data.email,
      status: this.data.status,
      facilityId: this.data.facilityId,
    };
  }

  // Only for the patient viewing their own record (PRD §7.1: "Own PII & Contact" = Own for
  // Patient, None/masked for every staff role) — callers must verify identity before using this.
  toOwnJSON() {
    return { ...this.toJSON(), phone: this.data.phone };
  }
}
