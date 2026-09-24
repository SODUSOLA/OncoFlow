// Shapes and constants for the NURSING DOCUMENTATION SHEET form, shared by the wizard's documentation
// step and QA's review screen so both agree on labels, units and analyte codes.

// One row per lab field on the paper form, mapped to the seeded lab_analyte_reference codes
// (apps/api/src/seed/clinicalMetrics.ts) so values post straight into the existing FBC/E-U-Cr panel.
export const LAB_FIELDS: { code: string; label: string; unit: string }[] = [
  { code: "PCV", label: "PCV", unit: "%" },
  { code: "WBC", label: "WBC", unit: "×10⁹/L" },
  { code: "NEUTROPHILS", label: "N", unit: "%" },
  { code: "PLATELETS", label: "PLT", unit: "×10⁹/L" },
  { code: "K", label: "K+", unit: "mmol/L" },
  { code: "NA", label: "Na+", unit: "mmol/L" },
  { code: "UREA", label: "Urea", unit: "mmol/L" },
  { code: "CREATININE", label: "Creatinine", unit: "µmol/L" },
];

// One row per true vital on the paper form, mapped to vital_type (vitalTypeEnum). Height and weight are
// on the paper's vitals table too, but they're biometric inputs to clinical_metrics_snapshot, not
// vital_reading rows — recorded through POST /clinical-metrics alongside the labs, not this list.
export const VITAL_FIELDS: { type: string; label: string; unit: string }[] = [
  { type: "BLOOD_PRESSURE_SYSTOLIC", label: "BP Systolic", unit: "mmHg" },
  { type: "BLOOD_PRESSURE_DIASTOLIC", label: "BP Diastolic", unit: "mmHg" },
  { type: "HEART_RATE_BPM", label: "Pulse Rate", unit: "b/m" },
  { type: "RESPIRATION_RATE", label: "Respiration", unit: "c/m" },
  { type: "TEMPERATURE_C", label: "Temperature", unit: "°C" },
  { type: "SPO2_PERCENT", label: "Oxygen Saturation", unit: "%" },
];

export interface DocumentationFormValues {
  // Diagnosis and Managing Consultant aren't nurse-entered — diagnosis comes from the cycle's regimen
  // (stated by the prescribing consultant) and Managing Consultant from the patient's facility's QA
  // officer (see DocumentationForm's own fetches), so neither is part of this editable-values shape.
  treatmentDate: string;
  infusionStart: string;
  infusionEnd: string;
  note: string;
  nextAppointmentDate: string;
  sex: "MALE" | "FEMALE";
  weightKg: string;
  heightM: string;
  vitals: Record<string, string>;
  labs: Record<string, string>;
}

// Returns today's date as YYYY-MM-DD.
function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// A blank form, with sex guessed from the patient's self-reported gender (still shown and editable,
// since CrCl's formula needs a specific binary input this free-text field doesn't reliably give).
// When resuming a case QA sent back, the previous sheet's text fields are carried over — vitals and
// labs still start blank, since a stale earlier reading shouldn't be resubmitted as if just taken.
export function emptyDocumentationForm(
  patientGender: string,
  previousSheet?: { treatmentDate: string | null; infusionStartTime: string | null; infusionEndTime: string | null; note: string | null; nextAppointmentDate: string | null } | null,
): DocumentationFormValues {
  return {
    treatmentDate: previousSheet?.treatmentDate ?? todayDateString(),
    // time inputs want HH:MM; the API stores HH:MM:SS.
    infusionStart: previousSheet?.infusionStartTime?.slice(0, 5) ?? "", infusionEnd: previousSheet?.infusionEndTime?.slice(0, 5) ?? "", note: previousSheet?.note ?? "",
    nextAppointmentDate: previousSheet?.nextAppointmentDate ?? "",
    sex: patientGender.trim().toLowerCase().startsWith("f") ? "FEMALE" : "MALE",
    weightKg: "", heightM: "", vitals: {}, labs: {},
  };
}

// Age in whole years from a date of birth, as of now — the clinical-metrics snapshot wants a plain
// integer, not a birth date, and this is the one place that derives it.
export function ageFromDob(dob: string): number {
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
}
