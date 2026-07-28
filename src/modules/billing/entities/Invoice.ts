import type { invoiceStatusEnum, invoiceComponentEnum } from "../../../db/enums";

type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number];
type InvoiceComponent = (typeof invoiceComponentEnum.enumValues)[number];

export interface InvoiceData {
  id: string;
  patientId: string;
  appointmentId: string | null;
  facilityId: string;
  classificationId: string;
  status: InvoiceStatus;
  totalKobo: bigint;
  issuedAt: Date | null;
}

export class Invoice {
  constructor(private data: InvoiceData) {}

  get id() { return this.data.id; }
  get status() { return this.data.status; }
  get totalKobo() { return this.data.totalKobo; }

  canTransitionTo(target: InvoiceStatus): boolean {
    const transitions: Record<InvoiceStatus, InvoiceStatus[]> = {
      DRAFT: ["SENT", "VOID"],
      SENT: ["PAID", "VOID", "OVERDUE"],
      PAID: [],
      VOID: [],
      OVERDUE: ["PAID", "VOID"],
    };
    return transitions[this.data.status]?.includes(target) ?? false;
  }

  transition(target: InvoiceStatus): Invoice {
    if (!this.canTransitionTo(target)) {
      throw new Error(`Cannot transition invoice from ${this.data.status} to ${target}`);
    }
    return new Invoice({
      ...this.data,
      status: target,
      issuedAt: target === "SENT" ? new Date() : this.data.issuedAt,
    });
  }

  toJSON() {
    return {
      id: this.data.id,
      patientId: this.data.patientId,
      facilityId: this.data.facilityId,
      classificationId: this.data.classificationId,
      status: this.data.status,
      totalKobo: this.data.totalKobo.toString(),
      issuedAt: this.data.issuedAt?.toISOString() ?? null,
    };
  }
}

export interface InvoiceItemData {
  id: string;
  invoiceId: string;
  component: InvoiceComponent;
  amountKobo: bigint;
}

export class InvoiceItem {
  constructor(private data: InvoiceItemData) {}

  toJSON() {
    return { ...this.data, amountKobo: this.data.amountKobo.toString() };
  }
}
