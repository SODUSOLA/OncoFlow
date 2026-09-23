import type { labRequestStatusEnum } from "../../../db/enums.js";

type LabRequestStatus = (typeof labRequestStatusEnum.enumValues)[number];

const VALID_TRANSITIONS: Record<LabRequestStatus, LabRequestStatus[]> = {
  PENDING: ["UPLOADED"],
  UPLOADED: ["REVIEWED"],
  REVIEWED: [],
};

export interface LabRequestData {
  id: string;
  patientId: string;
  requestedBy: string;
  status: LabRequestStatus;
  createdAt: Date;
}

// Domain entity for a lab request and its PENDING → UPLOADED → REVIEWED state machine.
export class LabRequest {
  constructor(private data: LabRequestData) {}

  get id() { return this.data.id; }
  get patientId() { return this.data.patientId; }
  get requestedBy() { return this.data.requestedBy; }
  get status() { return this.data.status; }

  // Returns a copy in the target status, or throws if the transition is illegal.
  transitionTo(target: LabRequestStatus): LabRequest {
    const allowed = VALID_TRANSITIONS[this.data.status];
    if (!allowed.includes(target)) {
      throw new Error(`Cannot transition from ${this.data.status} to ${target}`);
    }
    return new LabRequest({ ...this.data, status: target });
  }

  // Returns a copy marked UPLOADED.
  markUploaded(): LabRequest {
    return this.transitionTo("UPLOADED");
  }

  // Returns a copy marked REVIEWED.
  markReviewed(): LabRequest {
    return this.transitionTo("REVIEWED");
  }

  // Serializes the request for API responses.
  toJSON() {
    return {
      id: this.data.id,
      patientId: this.data.patientId,
      requestedBy: this.data.requestedBy,
      status: this.data.status,
      createdAt: this.data.createdAt,
    };
  }
}
