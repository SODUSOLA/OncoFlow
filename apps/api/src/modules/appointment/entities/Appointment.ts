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
  // Optional so fixtures predating the column still compile; real repository rows always have it.
  durationMinutes?: number | null;
  status: AppointmentStatus;
  meetingId: string | null;
  paymentConfirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
}

// Appointment domain entity that enforces the status state machine through immutable transitions.
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

  // Returns a copy moved to CONFIRMED.
  confirm(): Appointment {
    return this.transitionTo("CONFIRMED");
  }

  // Returns a copy moved to CHECKED_IN.
  checkIn(): Appointment {
    return this.transitionTo("CHECKED_IN");
  }

  // Returns a copy moved to IN_PROGRESS.
  startProgress(): Appointment {
    return this.transitionTo("IN_PROGRESS");
  }

  // Returns a copy moved to COMPLETED.
  complete(): Appointment {
    return this.transitionTo("COMPLETED");
  }

  // Returns a copy moved to CANCELLED.
  cancel(): Appointment {
    return this.transitionTo("CANCELLED");
  }

  // Returns a copy moved to MISSED.
  miss(): Appointment {
    return this.transitionTo("MISSED");
  }

  // Validates the target status against VALID_TRANSITIONS and returns a new Appointment, or throws if the move is illegal.
  private transitionTo(target: AppointmentStatus): Appointment {
    const allowed = VALID_TRANSITIONS[this.data.status];
    if (!allowed.includes(target)) {
      throw new Error(`Cannot transition from ${this.data.status} to ${target}`);
    }
    return new Appointment({ ...this.data, status: target, updatedAt: new Date() });
  }

  // Returns a copy stamped with the payment confirmation time.
  confirmPayment(timestamp: Date): Appointment {
    return new Appointment({ ...this.data, paymentConfirmedAt: timestamp, updatedAt: new Date() });
  }

  // Serializes the entity for API responses, with dates as ISO strings.
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
