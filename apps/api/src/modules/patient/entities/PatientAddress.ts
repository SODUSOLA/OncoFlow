export interface PatientAddressData {
  id: string;
  patientId: string;
  country: string;
  state: string;
  city: string;
  address: string;
}

export class PatientAddress {
  constructor(private data: PatientAddressData) {}

  toJSON() {
    return { ...this.data };
  }
}
