export interface EmergencyContactData {
  id: string;
  patientId: string;
  name: string;
  relationship: string;
  phone: string;
}

// Domain entity for a patient's emergency contact.
export class EmergencyContact {
  constructor(private data: EmergencyContactData) {}

  // Serializes the contact for API responses.
  toJSON() {
    return { ...this.data };
  }
}
