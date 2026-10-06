import type { facilityStatusEnum } from "../../../db/enums.js";

type FacilityStatus = (typeof facilityStatusEnum.enumValues)[number];

export interface FacilityData {
  id: string;
  name: string;
  region: string;
  address: string;
  description?: string | null;
  // Drizzle returns numeric columns as strings; null when a facility has no coordinates yet.
  latitude: string | null;
  longitude: string | null;
  status: FacilityStatus;
}

// Domain entity for a facility.
export class Facility {
  constructor(private data: FacilityData) {}

  get id() {
    return this.data.id;
  }
  get name() {
    return this.data.name;
  }
  get region() {
    return this.data.region;
  }
  get status() {
    return this.data.status;
  }

  // Serializes the facility for API responses.
  toJSON() {
    return { ...this.data };
  }
}
