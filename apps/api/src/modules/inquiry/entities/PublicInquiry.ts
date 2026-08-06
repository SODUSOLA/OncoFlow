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

export class PublicInquiry {
  constructor(private data: PublicInquiryData) {}

  get id() { return this.data.id; }
  get status() { return this.data.status; }

  // Public/visitor-facing view — deliberately omits linkedPatientId/assignedTo, which are
  // internal staff-workflow fields a visitor has no reason to see.
  toVisitorJSON() {
    return {
      id: this.data.id,
      name: this.data.name,
      status: this.data.status,
      createdAt: this.data.createdAt.toISOString(),
    };
  }

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
