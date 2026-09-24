import crypto from "node:crypto";
import {
  RegimenRepository, VitalsRepository, ClinicalMetricsRepository, LabDocumentRepository,
  ActivityLogRepository, CaseLockRepository,
} from "./repository.js";
import { computeClinicalMetrics, CRCL_CASE_LOCK_THRESHOLD, EGFR_CASE_LOCK_STAGES } from "../../lib/clinicalMetrics.js";
import { ConflictError } from "../../lib/errors.js";

const regimenRepo = new RegimenRepository();
const vitalsRepo = new VitalsRepository();
const metricsRepo = new ClinicalMetricsRepository();
const labDocumentRepo = new LabDocumentRepository();
const activityLogRepo = new ActivityLogRepository();
const caseLockRepo = new CaseLockRepository();

// Business logic for regimens.
export class RegimenService {
  // Cycle progress ("4/6 Cycles") is derived here, never stored.
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
      diagnosis: active.diagnosis,
      totalCycles: active.totalCycles,
      completedCycles,
      currentCycleNumber: currentCycle?.cycleNumber ?? null,
      status: active.status,
      startedAt: active.startedAt,
      cycles,
    };
  }

  // Nursing Officer's Schedule tab / Patient Selection step.
  async listCyclesForFacilityAndDate(facilityId: string, date: string) {
    return regimenRepo.findCyclesByFacilityAndDate(facilityId, date);
  }

  // Cycles still due (today's and any overdue), what the Schedule tab and case wizard actually let a nurse act on.
  async listDueCyclesForFacility(facilityId: string, throughDate: string) {
    return regimenRepo.findDueCyclesByFacility(facilityId, throughDate);
  }

  // A cycle's visitation is done (QA closed its case): the cycle leaves the Schedule, and the regimen
  // itself completes once its last cycle does.
  async completeCycle(regimenCycleId: string, administeredBy: string) {
    const cycle = await regimenRepo.markCycleCompleted(regimenCycleId, administeredBy);
    if (cycle) await regimenRepo.completeRegimenIfDone(cycle.regimenId);
  }

  // The diagnosis a consultant stated when prescribing the regimen this cycle belongs to — read-only from
  // the nursing documentation form's side; null if the cycle (or its diagnosis) can't be found.
  async getDiagnosisForCycle(regimenCycleId: string): Promise<string | null> {
    const row = await regimenRepo.findByCycleId(regimenCycleId);
    return row?.diagnosis ?? null;
  }

  // A consultant prescribing a new regimen for a patient — refuses a second concurrent ACTIVE one, and
  // generates the regimen's cycles up front (cycle 1 on startedAt, each following one cycleIntervalDays
  // later), the same shape the Schedule tab and case wizard already expect to find.
  async createRegimen(data: {
    patientId: string; drugName: string; protocolCode: string; diagnosis: string;
    totalCycles: number; cycleIntervalDays: number; startedAt: string; prescribedBy: string;
  }) {
    const existingActive = await regimenRepo.findActiveByPatient(data.patientId);
    if (existingActive) {
      throw new ConflictError("This patient already has an active regimen — discontinue it before prescribing a new one");
    }

    const regimenRow = await regimenRepo.create({
      id: crypto.randomUUID(), patientId: data.patientId, drugName: data.drugName, protocolCode: data.protocolCode,
      diagnosis: data.diagnosis, totalCycles: data.totalCycles, cycleIntervalDays: data.cycleIntervalDays,
      status: "ACTIVE", startedAt: new Date(data.startedAt), prescribedBy: data.prescribedBy,
    });

    const startDate = new Date(data.startedAt);
    const cycleRows = Array.from({ length: data.totalCycles }, (_, i) => {
      const scheduledDate = new Date(startDate);
      scheduledDate.setDate(scheduledDate.getDate() + i * data.cycleIntervalDays);
      return {
        id: crypto.randomUUID(), regimenId: regimenRow.id, cycleNumber: i + 1,
        scheduledDate: scheduledDate.toISOString().slice(0, 10), status: "SCHEDULED" as const,
      };
    });
    const cycles = await regimenRepo.createCycles(cycleRows);
    return { regimen: regimenRow, cycles };
  }
}

const VITAL_TYPES = [
  "WEIGHT_KG", "BLOOD_PRESSURE_SYSTOLIC", "BLOOD_PRESSURE_DIASTOLIC",
  "HEART_RATE_BPM", "TEMPERATURE_C", "SPO2_PERCENT", "RESPIRATION_RATE",
] as const;

// Business logic for vitals.
export class VitalsService {
  // Severity is computed here against vital_reference_range, never stored per reading.
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

  // Returns a patient's readings for one vital type with severity.
  async getTrendForPatient(patientId: string, vitalType: string, limit: number) {
    const rows = await vitalsRepo.findTrendByPatient(patientId, vitalType, limit);
    return rows.map((r) => ({ id: r.id, value: Number(r.value), recordedAt: r.recordedAt, source: r.source })).reverse();
  }

  // Records a vital reading.
  async recordReading(data: { patientId: string; vitalType: string; value: number; source: string; recordedBy?: string; meetingId?: string; nursingCaseId?: string }) {
    return vitalsRepo.insertReading({
      id: crypto.randomUUID(),
      patientId: data.patientId,
      vitalType: data.vitalType as never,
      value: String(data.value),
      recordedAt: new Date(),
      source: data.source as never,
      recordedBy: data.recordedBy ?? null,
      meetingId: data.meetingId ?? null,
      nursingCaseId: data.nursingCaseId ?? null,
    });
  }
}

export interface LabValueInput { analyteCode: string; value: number; unit: string }

// Business logic for clinical metrics snapshots.
export class ClinicalMetricsService {
  // Returns the current snapshot for a patient with its derived values.
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

  // Records the Nursing Officer's per-cycle biometrics and lab batch, computing metrics and triggering the CrCl case lock.
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

    // CrCl and eGFR can both fire but should produce one open case lock, so an existing unresolved lock is reused.
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

// Business logic for lab documents.
export class LabDocumentService {
  // Lists a patient's lab documents with review info.
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

// Business logic for the clinical activity log.
export class ActivityLogService {
  // Returns a patient's recent activity entries.
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

// Business logic for case locks.
export class CaseLockService {
  // Returns the patient's active case lock.
  async getActiveForPatient(patientId: string) {
    return caseLockRepo.findActiveByPatient(patientId);
  }
}
