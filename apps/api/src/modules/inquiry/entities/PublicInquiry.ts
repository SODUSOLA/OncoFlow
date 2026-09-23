import type { publicInquiryStatusEnum } from "../../../db/enums.js";

type PublicInquiryStatus = (typeof publicInquiryStatusEnum.enumValues)[number];

export interface PublicInquiryData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: PublicInquiryStatus;
  linkedPatientId: string | null;
  assignedTo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Domain entity for a public inquiry.
export class PublicInquiry {
  constructor(private data: PublicInquiryData) {}

  get id() { return this.data.id; }
  get status() { return this.data.status; }

  // Visitor-facing view that omits internal staff-workflow fields (linkedPatientId, assignedTo).
  toVisitorJSON() {
    return {
      id: this.data.id,
      name: this.data.name,
      status: this.data.status,
      createdAt: this.data.createdAt.toISOString(),
    };
  }

  // Serializes the inquiry for staff.
  toJSON() {
    return {
      id: this.data.id,
      name: this.data.name,
      email: this.data.email,
      phone: this.data.phone,
      status: this.data.status,
      linkedPatientId: this.data.linkedPatientId,
      assignedTo: this.data.assignedTo,
      createdAt: this.data.createdAt.toISOString(),
      updatedAt: this.data.updatedAt.toISOString(),
    };
  }
}
