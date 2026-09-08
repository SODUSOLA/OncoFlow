// Centralizes BMI/BSA/CrCl/eGFR computation and their tiering, per
// ONCOFLOW_LAB_AND_METRICS_WORKFLOW.md Track 1 — "a small static config/lookup... centralized
// in one place so Nursing Officer's view, the Video Room, and any other surface compute
// identically." Every consumer (nursing-entry service, Safety Check Banner, Patient File)
// imports from here rather than re-implementing the formulas.
//
// RESOLVED (was open): eGFR and CrCl are two separate, independently-labeled calculations, per
// the doc's later resolution — CrCl (Cockcroft-Gault) was always given; eGFR uses CKD-EPI 2021
// (race-free), the doc's own recommendation since the source spec didn't specify a formula.
// Their tier/stage boundaries do NOT line up (CrCl tiers: 50-59/30-49, from the original source
// doc; eGFR/KDIGO staging: 45-59/30-44, the real KDIGO cutoffs) — flagged in the doc itself as
// something to know, not a bug if the two disagree at the boundary.
//
// BMI classification (WHO standard) is the standard clinical band. The source doc references
// "the clinical spec you provided" for these without including the actual cutoff numbers in
// this doc, so — same as everywhere else in this project — flagging rather than guessing: these
// are the well-established standard values, not confirmed against whatever internal spec was
// referenced. Get clinical sign-off before relying on them for a real dosing/eligibility decision.

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

// Below this CrCl, per the product spec: locks the case pending Senior Clinical Director /
// Chief Consultant sign-off (case_lock.triggeredBy = CRCL_CRITICAL).
export const CRCL_CASE_LOCK_THRESHOLD = 50;
// eGFR case-lock trigger fires independently at KDIGO G4/G5 (eGFR < 30).
export const EGFR_CASE_LOCK_STAGES: readonly EgfrStage[] = ["G4", "G5"];

const UMOL_L_PER_MG_DL = 88.4;

export function classifyBmi(bmi: number): BmiClassification {
  if (bmi < 18.5) return "UNDERWEIGHT";
  if (bmi < 25) return "NORMAL";
  if (bmi < 30) return "OVERWEIGHT";
  return "OBESE";
}

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

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
