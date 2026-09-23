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
  secondaryEmail: string | null;
  profilePictureFileId: string | null;
  status: PatientStatus;
  facilityId: string;
  facilityConfirmedAt: Date | null;
  createdAt: Date;
}

// Domain entity for a patient with role-appropriate serializers.
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

  // Staff-facing view: phone and secondary email are Restricted PII and never rendered here, whatever the staff role (FR-04).
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
      profilePictureFileId: this.data.profilePictureFileId,
      status: this.data.status,
      facilityId: this.data.facilityId,
      // Null until a Regional Admin confirms the facility; onboarding status only, not an access gate.
      facilityConfirmedAt: this.data.facilityConfirmedAt,
      createdAt: this.data.createdAt,
    };
  }

  // View for the patient's own record only (PRD §7.1); callers must verify identity first.
  toOwnJSON() {
    return { ...this.toJSON(), phone: this.data.phone, secondaryEmail: this.data.secondaryEmail };
  }
}
