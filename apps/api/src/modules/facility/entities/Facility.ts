import type { facilityStatusEnum } from "../../../db/enums.js";

type FacilityStatus = (typeof facilityStatusEnum.enumValues)[number];

export interface FacilityData {
  id: string;
  name: string;
  region: string;
  address: string;
  // Drizzle's `numeric` columns come back as strings (arbitrary precision, not safe to widen
  // to `number` implicitly) — null when a facility hasn't been given coordinates yet.
  latitude: string | null;
  longitude: string | null;
  status: FacilityStatus;
}

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

  toJSON() {
    return { ...this.data };
  }
}
