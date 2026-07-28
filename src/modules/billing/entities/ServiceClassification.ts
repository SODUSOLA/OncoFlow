import type { serviceClassificationNameEnum } from "../../../db/enums";

type ClassificationName = (typeof serviceClassificationNameEnum.enumValues)[number];

export interface ServiceClassificationData {
  id: string;
  name: ClassificationName;
  cappedNetworkFeeKobo: bigint;
}

export class ServiceClassification {
  constructor(private data: ServiceClassificationData) {}

  get id() { return this.data.id; }
  get name() { return this.data.name; }
  get cappedNetworkFeeKobo() { return this.data.cappedNetworkFeeKobo; }

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
  drugPriceKobo: bigint;
}

export class Tariff {
  constructor(private data: TariffData) {}

  get id() { return this.data.id; }
  get facilityId() { return this.data.facilityId; }
  get classificationId() { return this.data.classificationId; }

  totalKobo(): bigint {
    return this.data.networkFeeKobo + this.data.facilityBedFeeKobo + this.data.drugPriceKobo;
  }

  toJSON() {
    return {
      id: this.data.id,
      facilityId: this.data.facilityId,
      classificationId: this.data.classificationId,
      networkFeeKobo: this.data.networkFeeKobo.toString(),
      facilityBedFeeKobo: this.data.facilityBedFeeKobo.toString(),
      drugPriceKobo: this.data.drugPriceKobo.toString(),
    };
  }
}
