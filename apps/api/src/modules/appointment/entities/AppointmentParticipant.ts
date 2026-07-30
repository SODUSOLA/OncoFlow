export interface AppointmentParticipantData {
  id: string;
  appointmentId: string;
  userId: string;
  role: string;
  createdAt: Date;
}

export class AppointmentParticipant {
  constructor(private data: AppointmentParticipantData) {}

  get id() { return this.data.id; }
  get appointmentId() { return this.data.appointmentId; }
  get userId() { return this.data.userId; }
  get role() { return this.data.role; }

  toJSON() {
    return { ...this.data, createdAt: this.data.createdAt.toISOString() };
  }
}
