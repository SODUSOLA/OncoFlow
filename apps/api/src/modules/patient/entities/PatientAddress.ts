export interface PatientAddressData {
  id: string;
  patientId: string;
  country: string;
  state: string;
  city: string;
  address: string;
}

// Domain entity for a patient address.
export class PatientAddress {
  constructor(private data: PatientAddressData) {}

  // Serializes the address for API responses.
  toJSON() {
    return { ...this.data };
  }
}
