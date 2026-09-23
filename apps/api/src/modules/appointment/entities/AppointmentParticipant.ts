export interface AppointmentParticipantData {
  id: string;
  appointmentId: string;
  userId: string;
  role: string;
  createdAt: Date;
}

// Domain entity for a user attached to an appointment in a given role.
export class AppointmentParticipant {
  constructor(private data: AppointmentParticipantData) {}

  get id() { return this.data.id; }
  get appointmentId() { return this.data.appointmentId; }
  get userId() { return this.data.userId; }
  get role() { return this.data.role; }

  // Serializes the participant for API responses, with dates as ISO strings.
  toJSON() {
    return { ...this.data, createdAt: this.data.createdAt.toISOString() };
  }
}
