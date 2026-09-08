import crypto from "node:crypto";
import {
  RegimenRepository, VitalsRepository, ClinicalMetricsRepository, LabDocumentRepository,
  ActivityLogRepository, CaseLockRepository,
} from "./repository.js";
import { computeClinicalMetrics, CRCL_CASE_LOCK_THRESHOLD, EGFR_CASE_LOCK_STAGES } from "../../lib/clinicalMetrics.js";

const regimenRepo = new RegimenRepository();
const vitalsRepo = new VitalsRepository();
const metricsRepo = new ClinicalMetricsRepository();
const labDocumentRepo = new LabDocumentRepository();
const activityLogRepo = new ActivityLogRepository();
const caseLockRepo = new CaseLockRepository();

export class RegimenService {
  // Cycle progress ("4/6 Cycles") is derived here, never stored — per
  // ONCOFLOW_PATIENT_DATA_MODELS.md §1.
  async getForPatient(patientId: string) {
    const active = await regimenRepo.findActiveByPatient(patientId);
    if (!active) return null;
    const cycles = await regimenRepo.findCyclesByRegimen(active.id);
    const completedCycles = cycles.filter((c) => c.status === "COMPLETED").length;
    const currentCycle = cycles.find((c) => c.status !== "COMPLETED") ?? cycles[cycles.length - 1] ?? null;
    return {
      id: active.id,
      drugName: active.drugName,
      protocolCode: active.protocolCode,
      totalCycles: active.totalCycles,
      completedCycles,
      currentCycleNumber: currentCycle?.cycleNumber ?? null,
      status: active.status,
      startedAt: active.startedAt,
      cycles,
    };
  }
}

const VITAL_TYPES = ["WEIGHT_KG", "BLOOD_PRESSURE_SYSTOLIC", "BLOOD_PRESSURE_DIASTOLIC", "HEART_RATE_BPM", "TEMPERATURE_C", "SPO2_PERCENT"] as const;

export class VitalsService {
  // Severity is computed here against vital_reference_range, never stored per-reading — same
  // rule the lab panel follows.
  async getLatestForPatient(patientId: string) {
    const [latest, ranges] = await Promise.all([
      vitalsRepo.findLatestByPatient(patientId),
      vitalsRepo.findAllReferenceRanges(),
    ]);
    const rangeByType = new Map(ranges.map((r) => [r.vitalType, r]));
    return VITAL_TYPES.map((type) => {
      const reading = latest.find((r) => r.vital_type === type);
      const range = rangeByType.get(type);
      const value = reading ? Number(reading.value) : null;
      const severity = value === null || !range
        ? null
        : value < Number(range.low) || value > Number(range.high) ? "ELEVATED" : "NORMAL";
      return {
        vitalType: type,
        value,
        recordedAt: reading?.recorded_at ?? null,
        source: reading?.source ?? null,
        referenceLow: range ? Number(range.low) : null,
        referenceHigh: range ? Number(range.high) : null,
        severity,
      };
    });
  }

  async getTrendForPatient(patientId: string, vitalType: string, limit: number) {
    const rows = await vitalsRepo.findTrendByPatient(patientId, vitalType, limit);
    return rows.map((r) => ({ id: r.id, value: Number(r.value), recordedAt: r.recordedAt, source: r.source })).reverse();
  }

  async recordReading(data: { patientId: string; vitalType: string; value: number; source: string; recordedBy?: string; meetingId?: string }) {
    return vitalsRepo.insertReading({
      id: crypto.randomUUID(),
      patientId: data.patientId,
      vitalType: data.vitalType as never,
      value: String(data.value),
      recordedAt: new Date(),
      source: data.source as never,
      recordedBy: data.recordedBy ?? null,
      meetingId: data.meetingId ?? null,
    });
  }
}

export interface LabValueInput { analyteCode: string; value: number; unit: string }

export class ClinicalMetricsService {
  async getCurrentForPatient(patientId: string) {
    const snapshot = await metricsRepo.findCurrentByPatient(patientId);
    if (!snapshot) return null;
    const labValues = await metricsRepo.findLabValuesForSnapshot(snapshot.id);
    return {
      ...snapshot,
      labValues: labValues.map((v) => ({
        ...v,
        value: Number(v.value),
        normalLow: Number(v.normalLow),
        normalHigh: Number(v.normalHigh),
        criticalLow: v.criticalLow === null ? null : Number(v.criticalLow),
        criticalHigh: v.criticalHigh === null ? null : Number(v.criticalHigh),
        outOfRange: Number(v.value) < Number(v.normalLow) || Number(v.value) > Number(v.normalHigh),
      })),
    };
  }

  // The Nursing Officer's real per-cycle entry — biometrics + the FBC/E-U-Cr batch in one
  // submission, per ONCOFLOW_LAB_AND_METRICS_WORKFLOW.md's Track 1 extension. Built now (ahead
  // of the Nursing Officer phase itself) because it's real, reusable business logic — the CrCl
  // case-lock trigger in particular needs to exist before any snapshot can be recorded safely.
  async recordSnapshot(data: {
    patientId: string; regimenCycleId?: string; recordedBy: string;
    weightKg: number; heightCm: number; ageYears: number; sex: "MALE" | "FEMALE";
    labValues: LabValueInput[]; sourceLabDocumentId?: string;
  }) {
    const creatinine = data.labValues.find((v) => v.analyteCode === "CREATININE");
    if (!creatinine) throw new Error("Creatinine is required to compute CrCl");

    const computed = computeClinicalMetrics({
      weightKg: data.weightKg,
      heightCm: data.heightCm,
      ageYears: data.ageYears,
      sex: data.sex,
      serumCreatinineUmolL: creatinine.value,
    });

    const previous = await metricsRepo.findCurrentByPatient(data.patientId);
    const now = new Date();

    const snapshotId = crypto.randomUUID();
    await metricsRepo.insertSnapshot({
      id: snapshotId,
      patientId: data.patientId,
      regimenCycleId: data.regimenCycleId ?? null,
      recordedBy: data.recordedBy,
      recordedAt: now,
      weightKg: String(data.weightKg),
      heightCm: String(data.heightCm),
      ageYears: data.ageYears,
      sex: data.sex,
      bmi: String(computed.bmi),
      bmiClassification: computed.bmiClassification,
      bsa: String(computed.bsa),
      crcl: String(computed.crcl),
      crclTier: computed.crclTier,
      egfr: String(computed.egfr),
      egfrStage: computed.egfrStage,
    });

    if (previous) await metricsRepo.supersede(previous.id, now);

    const entryId = crypto.randomUUID();
    await metricsRepo.insertLabEntry({
      id: entryId,
      clinicalMetricsSnapshotId: snapshotId,
      enteredBy: data.recordedBy,
      enteredAt: now,
      sourceLabDocumentId: data.sourceLabDocumentId ?? null,
    });
    await metricsRepo.insertLabValues(data.labValues.map((v) => ({
      id: crypto.randomUUID(),
      nursingLabEntryId: entryId,
      analyteCode: v.analyteCode,
      value: String(v.value),
      unit: v.unit,
    })));

    // CrCl and eGFR can both fire on the same snapshot — per the doc, that's still one open
    // case_lock, not two. Check for an existing unresolved lock before inserting; if the case
    // is already locked, a second trigger on the same cycle doesn't stack another row (the
    // existing lock's own record already captures "this patient's case is locked", and
    // resolution isn't per-trigger).
    const crclCritical = computed.crcl < CRCL_CASE_LOCK_THRESHOLD;
    const egfrCritical = EGFR_CASE_LOCK_STAGES.includes(computed.egfrStage);
    if (crclCritical || egfrCritical) {
      const existingLock = await caseLockRepo.findActiveByPatient(data.patientId);
      if (!existingLock) {
        await caseLockRepo.create({
          id: crypto.randomUUID(),
          patientId: data.patientId,
          triggeredBy: crclCritical ? "CRCL_CRITICAL" : "EGFR_CRITICAL",
          triggeredByReference: snapshotId,
          triggeredAt: now,
          status: "LOCKED",
        });
      }
    }

    return this.getCurrentForPatient(data.patientId);
  }
}

export class LabDocumentService {
  async listForPatient(patientId: string) {
    const rows = await labDocumentRepo.findByPatientWithAdminReview(patientId);
    return rows.map((r) => ({
      id: r.id,
      uploadedAt: r.uploadedAt,
      claimedCollectionDate: r.claimedCollectionDate,
      workflowStatus: r.workflowStatus,
      adminApprovedAt: r.adminDecision === "APPROVED" ? r.adminReviewedAt : null,
      adminName: r.adminDecision === "APPROVED" ? r.adminName : null,
    }));
  }
}

export class ActivityLogService {
  async getForPatient(patientId: string, limit: number) {
    const rows = await activityLogRepo.findByPatient(patientId, limit);
    return rows.map((r) => ({
      activityType: r.activity_type,
      timestamp: r.timestamp,
      provider: r.provider,
      status: r.status,
    }));
  }
}

export class CaseLockService {
  async getActiveForPatient(patientId: string) {
    return caseLockRepo.findActiveByPatient(patientId);
  }
}
