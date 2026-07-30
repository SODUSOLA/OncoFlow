export interface EmergencyContactData {
  id: string;
  patientId: string;
  name: string;
  relationship: string;
  phone: string;
}

export class EmergencyContact {
  constructor(private data: EmergencyContactData) {}

  toJSON() {
    return { ...this.data };
  }
}
