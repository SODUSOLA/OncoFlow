import type { prescriptionStatusEnum } from "../../../db/enums.js";

type PrescriptionStatus = (typeof prescriptionStatusEnum.enumValues)[number];

export interface PrescriptionData {
  id: string;
  patientId: string;
  doctorId: string;
  appointmentId: string | null;
  triageChecklistId: string | null;
  status: PrescriptionStatus;
  createdAt: Date;
}

export class Prescription {
  constructor(private data: PrescriptionData) {}

  get id() { return this.data.id; }
  get patientId() { return this.data.patientId; }
  get doctorId() { return this.data.doctorId; }
  get appointmentId() { return this.data.appointmentId; }
  get triageChecklistId() { return this.data.triageChecklistId; }
  get status() { return this.data.status; }
  get createdAt() { return this.data.createdAt; }

  toJSON() {
    return {
      id: this.data.id,
      patientId: this.data.patientId,
      doctorId: this.data.doctorId,
      appointmentId: this.data.appointmentId,
      triageChecklistId: this.data.triageChecklistId,
      status: this.data.status,
      createdAt: this.data.createdAt.toISOString(),
    };
  }
}
