export type AppointmentStatus = "PENDING" | "CONFIRMED" | "CHECKED_IN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "MISSED";

const VALID_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "MISSED"],
  CHECKED_IN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  MISSED: [],
};

export interface AppointmentData {
  id: string;
  patientId: string;
  oncologistId: string | null;
  facilityId: string;
  appointmentType: string;
  scheduledAt: Date;
  // Optional (not just nullable) so existing test fixtures built before this field existed
  // don't all need updating — every real row from the repository has it, since the column
  // itself is nullable-but-present.
  durationMinutes?: number | null;
  status: AppointmentStatus;
  meetingId: string | null;
  paymentConfirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
}

export class Appointment {
  constructor(private data: AppointmentData) {}

  get id() { return this.data.id; }
  get patientId() { return this.data.patientId; }
  get oncologistId() { return this.data.oncologistId; }
  get facilityId() { return this.data.facilityId; }
  get appointmentType() { return this.data.appointmentType; }
  get scheduledAt() { return this.data.scheduledAt; }
  get durationMinutes() { return this.data.durationMinutes; }
  get status() { return this.data.status; }
  get paymentConfirmedAt() { return this.data.paymentConfirmedAt; }

  confirm(): Appointment {
    return this.transitionTo("CONFIRMED");
  }

  checkIn(): Appointment {
    return this.transitionTo("CHECKED_IN");
  }

  startProgress(): Appointment {
    return this.transitionTo("IN_PROGRESS");
  }

  complete(): Appointment {
    return this.transitionTo("COMPLETED");
  }

  cancel(): Appointment {
    return this.transitionTo("CANCELLED");
  }

  miss(): Appointment {
    return this.transitionTo("MISSED");
  }

  private transitionTo(target: AppointmentStatus): Appointment {
    const allowed = VALID_TRANSITIONS[this.data.status];
    if (!allowed.includes(target)) {
      throw new Error(`Cannot transition from ${this.data.status} to ${target}`);
    }
    return new Appointment({ ...this.data, status: target, updatedAt: new Date() });
  }

  confirmPayment(timestamp: Date): Appointment {
    return new Appointment({ ...this.data, paymentConfirmedAt: timestamp, updatedAt: new Date() });
  }

  toJSON() {
    return {
      id: this.data.id,
      patientId: this.data.patientId,
      oncologistId: this.data.oncologistId,
      facilityId: this.data.facilityId,
      appointmentType: this.data.appointmentType,
      scheduledAt: this.data.scheduledAt.toISOString(),
      durationMinutes: this.data.durationMinutes,
      status: this.data.status,
      paymentConfirmedAt: this.data.paymentConfirmedAt?.toISOString() ?? null,
      createdAt: this.data.createdAt.toISOString(),
      updatedAt: this.data.updatedAt.toISOString(),
    };
  }
}
