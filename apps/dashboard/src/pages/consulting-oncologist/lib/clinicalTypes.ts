// Shared clinical types and classification color maps, so every consultant screen agrees on what "critical" looks like.

export interface RegimenData {
  id: string; drugName: string; protocolCode: string; totalCycles: number;
  completedCycles: number; currentCycleNumber: number | null; status: string; startedAt: string;
  cycles: { id: string; cycleNumber: number; scheduledDate: string; status: string }[];
}

export interface ClinicalMetricsSnapshot {
  id: string; recordedAt: string; bmi: string; bmiClassification: string; bsa: string;
  crcl: string; crclTier: string; egfr: string; egfrStage: string;
}

export interface VitalLatest {
  vitalType: string; value: number | null; recordedAt: string | null; source: string | null;
  referenceLow: number | null; referenceHigh: number | null; severity: "NORMAL" | "ELEVATED" | null;
}

export interface VitalTrendPoint { id: string; value: number; recordedAt: string; source: string }

export interface LabDocumentRow {
  id: string; uploadedAt: string; claimedCollectionDate: string; workflowStatus: string;
  adminApprovedAt: string | null; adminName: string | null;
}

export interface ActivityEntry { activityType: string; timestamp: string; provider: string | null; status: string | null }

export interface CaseLockData {
  id: string; triggeredBy: string; triggeredAt: string; status: string;
  resolvedByRole: string | null; resolution: string | null;
}

export const VITAL_LABELS: Record<string, string> = {
  HEART_RATE_BPM: "Heart Rate", TEMPERATURE_C: "Temperature", SPO2_PERCENT: "SpO2",
  BLOOD_PRESSURE_SYSTOLIC: "BP Systolic", BLOOD_PRESSURE_DIASTOLIC: "BP Diastolic", WEIGHT_KG: "Weight",
};
export const VITAL_UNITS: Record<string, string> = {
  HEART_RATE_BPM: "bpm", TEMPERATURE_C: "°C", SPO2_PERCENT: "%",
  BLOOD_PRESSURE_SYSTOLIC: "mmHg", BLOOD_PRESSURE_DIASTOLIC: "mmHg", WEIGHT_KG: "kg",
};

export const BMI_COLOR: Record<string, string> = {
  UNDERWEIGHT: "text-admin-warning", NORMAL: "text-admin-success",
  OVERWEIGHT: "text-admin-warning", OBESE: "text-admin-danger",
};
export const CRCL_COLOR: Record<string, string> = {
  NORMAL: "text-admin-success", MILD_IMPAIRMENT: "text-admin-success",
  MODERATE_3A: "text-admin-warning", MODERATE_SEVERE_3B: "text-admin-danger", SEVERE: "text-admin-danger",
};
export const EGFR_COLOR: Record<string, string> = {
  G1: "text-admin-success", G2: "text-admin-success", G3A: "text-admin-warning",
  G3B: "text-admin-warning", G4: "text-admin-danger", G5: "text-admin-danger",
};

export const TRIGGER_LABEL: Record<string, string> = {
  CRCL_CRITICAL: "Critical CrCl", EGFR_CRITICAL: "Critical eGFR (KDIGO G4/G5)", QA_HOLD: "QA Hold",
};

// True for a snapshot worth alerting on, matching the backend's case-lock definition; the frontend only reads severity, never recomputes it.
export function isCriticalMetrics(m: ClinicalMetricsSnapshot | null): boolean {
  if (!m) return false;
  return m.crclTier === "SEVERE" || m.egfrStage === "G4" || m.egfrStage === "G5";
}
