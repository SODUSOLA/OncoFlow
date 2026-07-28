import type { facilityStatusEnum } from "../../../db/enums";

type FacilityStatus = (typeof facilityStatusEnum.enumValues)[number];

export interface FacilityData {
  id: string;
  name: string;
  region: string;
  address: string;
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
