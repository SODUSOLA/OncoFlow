import type { InvoiceComponent, InvoiceStatus, ServiceClassification } from "./types";

export const INVOICE_STATUS_VARIANT: Record<InvoiceStatus, "default" | "success" | "warning" | "critical"> = {
  DRAFT: "default",
  SENT: "warning",
  PAID: "success",
  VOID: "default",
  OVERDUE: "critical",
};

export const COMPONENT_LABELS: Record<InvoiceComponent, string> = {
  NETWORK_FEE: "Network fee",
  FACILITY_FEE: "Facility fee",
  PROFESSIONAL_FEE: "Professional fee",
  DRUG_COST: "Drugs & administration",
};

export const CLASSIFICATION_LABELS: Record<ServiceClassification["name"], string> = {
  SUBSCRIPTION: "Subscription",
  CONSULTATION: "Clinical Consultation",
  DRUG_ADMINISTRATION: "Drug Administration",
  CHEMOTHERAPY: "Chemotherapy Session",
  GENERAL_ADMISSION: "General Admission",
  PROCEDURE: "Procedure",
  SIDE_EFFECT_REPORT: "Side Effect Report",
};

// Formats a kobo string as a naira amount.
export function koboToNaira(kobo: string) {
  return `₦${(Number(kobo) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}
