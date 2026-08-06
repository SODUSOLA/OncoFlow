export interface Metric {
  label: string;
  value: string;
}

/** Placeholder impact figures — update in this single file once real numbers land. */
export const metrics: Metric[] = [
  { label: "Patients Supported", value: "1,200+" },
  { label: "Appointments Coordinated", value: "8,500+" },
  { label: "Clinical Teams", value: "40+" },
  { label: "Healthcare Facilities", value: "15" },
  { label: "Patient Satisfaction", value: "96%" },
];

export interface CategoryItem {
  label: string;
}

/** "Built for Modern Cancer Care" categories — swap for real partner logos later. */
export const careCategories: CategoryItem[] = [
  { label: "Hospitals" },
  { label: "Cancer Centers" },
  { label: "Oncology Clinics" },
  { label: "Research Institutions" },
  { label: "NGOs" },
];

export interface ComparisonRow {
  traditional: string;
  oncoflow: string;
}

export const comparisonRows: ComparisonRow[] = [
  { traditional: "Care coordinated over phone calls and chat groups", oncoflow: "One system of record, visible to every role involved" },
  { traditional: "Invoices calculated manually against paper tariffs", oncoflow: "Zero-manual-input invoicing, rule-driven and locked" },
  { traditional: "No enforced sequence before chemo day", oncoflow: "Labs, sign-off, and payment hard-gated before scheduling" },
  { traditional: "Patient history scattered across facilities", oncoflow: "One permanent Unique Patient ID, one timeline" },
  { traditional: "Response times informal and unmeasured", oncoflow: "2-minute and 5-minute SLAs, visible as live countdowns" },
];
