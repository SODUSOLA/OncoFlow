import { db } from "../db/index.js";
import { labAnalyteReference, vitalReferenceRange } from "../db/schema.js";

// FBC/E-U-Cr panel, exactly the table given in ONCOFLOW_LAB_AND_METRICS_WORKFLOW.md's Track 1
// extension. Only normal ranges were supplied — critical thresholds stay null (see the doc's
// own "Open gap" note) until a clinical lead provides real cutoffs for auto-flagging.
const LAB_ANALYTES = [
  { analyteCode: "WBC", displayName: "White Blood Cells", unit: "×10⁹/L", normalLow: "4.0", normalHigh: "11.0" },
  { analyteCode: "RBC", displayName: "Red Blood Cells", unit: "×10¹²/L", normalLow: "3.8", normalHigh: "5.8" },
  { analyteCode: "HB", displayName: "Haemoglobin", unit: "g/dL", normalLow: "11.5", normalHigh: "16.5" },
  { analyteCode: "PCV", displayName: "Packed Cell Volume", unit: "%", normalLow: "35", normalHigh: "50" },
  { analyteCode: "MCV", displayName: "Mean Corpuscular Volume", unit: "fL", normalLow: "80", normalHigh: "100" },
  { analyteCode: "PLATELETS", displayName: "Platelets", unit: "×10⁹/L", normalLow: "150", normalHigh: "400" },
  { analyteCode: "NEUTROPHILS", displayName: "Neutrophils", unit: "%", normalLow: "40", normalHigh: "75" },
  { analyteCode: "LYMPHOCYTES", displayName: "Lymphocytes", unit: "%", normalLow: "20", normalHigh: "45" },
  { analyteCode: "NA", displayName: "Sodium", unit: "mmol/L", normalLow: "135", normalHigh: "145" },
  { analyteCode: "K", displayName: "Potassium", unit: "mmol/L", normalLow: "3.5", normalHigh: "5.1" },
  { analyteCode: "CL", displayName: "Chloride", unit: "mmol/L", normalLow: "95", normalHigh: "108" },
  { analyteCode: "HCO3", displayName: "Bicarbonate", unit: "mmol/L", normalLow: "22", normalHigh: "29" },
  { analyteCode: "UREA", displayName: "Urea", unit: "mmol/L", normalLow: "1.7", normalHigh: "8.3" },
  // Canonical unit, matching Track 1's clinical_metrics_snapshot / CrCl formula.
  { analyteCode: "CREATININE", displayName: "Creatinine", unit: "µmol/L", normalLow: "44", normalHigh: "106" },
];

// Standard adult vital-sign reference bands (widely-cited WHO/AHA norms) — the source docs
// didn't supply explicit numbers for these, unlike the lab panel above, so same flag: standard
// values, not confirmed against an internal clinical spec. WEIGHT_KG is deliberately not seeded
// here — weight has no population-wide "normal band" the way BP/HR/temp/SpO2 do; its own
// severity concept (per the Post-call Summary mockup) is a trend ("-1.2kg since last consult"),
// not a fixed range, and that's a UI/query concern, not a reference-range row.
const VITAL_RANGES = [
  { vitalType: "BLOOD_PRESSURE_SYSTOLIC" as const, low: "90", high: "120" },
  { vitalType: "BLOOD_PRESSURE_DIASTOLIC" as const, low: "60", high: "80" },
  { vitalType: "HEART_RATE_BPM" as const, low: "60", high: "100" },
  { vitalType: "TEMPERATURE_C" as const, low: "36.1", high: "37.2" },
  { vitalType: "SPO2_PERCENT" as const, low: "95", high: "100" },
];

export async function seedClinicalMetrics() {
  const existing = await db.select().from(labAnalyteReference).limit(1);
  if (existing.length > 0) {
    console.log("Clinical metrics reference data already seeded, skipping");
    return;
  }

  await db.insert(labAnalyteReference).values(LAB_ANALYTES);
  console.log(`Seeded ${LAB_ANALYTES.length} lab analyte reference rows`);

  await db.insert(vitalReferenceRange).values(VITAL_RANGES);
  console.log(`Seeded ${VITAL_RANGES.length} vital reference range rows`);
}
