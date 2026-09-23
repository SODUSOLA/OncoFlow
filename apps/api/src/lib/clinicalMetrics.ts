// Single home for BMI/BSA/CrCl/eGFR maths and tiering so every surface computes identically; eGFR (CKD-EPI 2021) and CrCl (Cockcroft-Gault) are separate calculations with different boundaries.

import type { bmiClassificationEnum, crclTierEnum, egfrStageEnum } from "../db/enums.js";

type BmiClassification = (typeof bmiClassificationEnum.enumValues)[number];
type CrclTier = (typeof crclTierEnum.enumValues)[number];
type EgfrStage = (typeof egfrStageEnum.enumValues)[number];

export interface ClinicalMetricsInput {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: "MALE" | "FEMALE";
  serumCreatinineUmolL: number;
}

export interface ClinicalMetricsResult {
  bmi: number;
  bmiClassification: BmiClassification;
  bsa: number;
  crcl: number;
  crclTier: CrclTier;
  egfr: number;
  egfrStage: EgfrStage;
}

// CrCl below this locks the case pending senior clinical sign-off (case_lock.triggeredBy = CRCL_CRITICAL).
export const CRCL_CASE_LOCK_THRESHOLD = 50;
// eGFR case-lock trigger fires independently at KDIGO G4/G5 (eGFR < 30).
export const EGFR_CASE_LOCK_STAGES: readonly EgfrStage[] = ["G4", "G5"];

const UMOL_L_PER_MG_DL = 88.4;

// Classifies BMI by the standard WHO bands; these cutoffs are not confirmed against an internal spec, so get clinical sign-off before dosing decisions.
export function classifyBmi(bmi: number): BmiClassification {
  if (bmi < 18.5) return "UNDERWEIGHT";
  if (bmi < 25) return "NORMAL";
  if (bmi < 30) return "OVERWEIGHT";
  return "OBESE";
}

// Maps a Cockcroft-Gault CrCl value to its tier.
export function classifyCrcl(crcl: number): CrclTier {
  if (crcl >= 90) return "NORMAL";
  if (crcl >= 60) return "MILD_IMPAIRMENT";
  if (crcl >= 45) return "MODERATE_3A";
  if (crcl >= 30) return "MODERATE_SEVERE_3B";
  return "SEVERE";
}

// Real KDIGO staging — deliberately different cutoffs from classifyCrcl above.
export function classifyEgfr(egfr: number): EgfrStage {
  if (egfr >= 90) return "G1";
  if (egfr >= 60) return "G2";
  if (egfr >= 45) return "G3A";
  if (egfr >= 30) return "G3B";
  if (egfr >= 15) return "G4";
  return "G5";
}

// Computes BMI, BSA, CrCl and eGFR with their tiers from one set of biometric inputs.
export function computeClinicalMetrics(input: ClinicalMetricsInput): ClinicalMetricsResult {
  const { weightKg, heightCm, ageYears, sex, serumCreatinineUmolL } = input;
  const heightM = heightCm / 100;

  const bmi = weightKg / (heightM * heightM);
  const bsa = 0.007184 * Math.pow(heightCm, 0.725) * Math.pow(weightKg, 0.425);

  const scrMgDl = serumCreatinineUmolL / UMOL_L_PER_MG_DL;

  let crcl = ((140 - ageYears) * weightKg) / (72 * scrMgDl);
  if (sex === "FEMALE") crcl *= 0.85;

  // CKD-EPI 2021 (race-free).
  const kappa = sex === "FEMALE" ? 0.7 : 0.9;
  const alpha = sex === "FEMALE" ? -0.241 : -0.302;
  const scrOverKappa = scrMgDl / kappa;
  let egfr = 142
    * Math.pow(Math.min(scrOverKappa, 1), alpha)
    * Math.pow(Math.max(scrOverKappa, 1), -1.2)
    * Math.pow(0.9938, ageYears);
  if (sex === "FEMALE") egfr *= 1.012;

  return {
    bmi: round(bmi, 1),
    bmiClassification: classifyBmi(bmi),
    bsa: round(bsa, 2),
    crcl: round(crcl, 1),
    crclTier: classifyCrcl(crcl),
    egfr: round(egfr, 1),
    egfrStage: classifyEgfr(egfr),
  };
}

// Rounds a number to the given decimal places.
function round(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
