import type { serviceClassificationNameEnum } from "../../../db/enums.js";

type ClassificationName = (typeof serviceClassificationNameEnum.enumValues)[number];

export interface ServiceClassificationData {
  id: string;
  name: ClassificationName;
  cappedNetworkFeeKobo: bigint;
}

// Domain entity for a billing service classification and its capped network fee.
export class ServiceClassification {
  constructor(private data: ServiceClassificationData) {}

  get id() { return this.data.id; }
  get name() { return this.data.name; }
  get cappedNetworkFeeKobo() { return this.data.cappedNetworkFeeKobo; }

  // Serializes the classification for API responses.
  toJSON() {
    return { id: this.data.id, name: this.data.name, cappedNetworkFeeKobo: this.data.cappedNetworkFeeKobo.toString() };
  }
}

export interface TariffData {
  id: string;
  facilityId: string;
  classificationId: string;
  networkFeeKobo: bigint;
  facilityBedFeeKobo: bigint;
  professionalFeeKobo: bigint;
  drugPriceKobo: bigint;
}

// Domain entity for a facility's fee tariff for one classification.
export class Tariff {
  constructor(private data: TariffData) {}

  get id() { return this.data.id; }
  get facilityId() { return this.data.facilityId; }
  get classificationId() { return this.data.classificationId; }

  // Sums the network, facility, professional and drug components in kobo.
  totalKobo(): bigint {
    return this.data.networkFeeKobo + this.data.facilityBedFeeKobo + this.data.professionalFeeKobo + this.data.drugPriceKobo;
  }

  // Serializes the tariff for API responses.
  toJSON() {
    return {
      id: this.data.id,
      facilityId: this.data.facilityId,
      classificationId: this.data.classificationId,
      networkFeeKobo: this.data.networkFeeKobo.toString(),
      facilityBedFeeKobo: this.data.facilityBedFeeKobo.toString(),
      professionalFeeKobo: this.data.professionalFeeKobo.toString(),
      drugPriceKobo: this.data.drugPriceKobo.toString(),
    };
  }
}
