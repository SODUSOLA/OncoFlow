import { db } from "../../db/index.js";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import {
  regimen, regimenCycle, vitalReading, vitalReferenceRange,
  clinicalMetricsSnapshot, nursingLabEntry, nursingLabValue, labAnalyteReference,
  labDocument, labDocumentReview, caseLock,
} from "./schema.js";
import { user } from "../auth/schema.js";
import { patient } from "../patient/schema.js";

export class RegimenRepository {
  // Nursing Officer's Schedule tab / Patient Selection step — every cycle scheduled at a
  // facility on a given day, joined straight through to the patient display fields the cards
  // need, so the caller doesn't have to N+1 a second patient fetch per row.
  async findCyclesByFacilityAndDate(facilityId: string, date: string) {
    return db
      .select({
        id: regimenCycle.id, cycleNumber: regimenCycle.cycleNumber, scheduledDate: regimenCycle.scheduledDate,
        status: regimenCycle.status, drugName: regimen.drugName, protocolCode: regimen.protocolCode,
        patientId: patient.id, firstName: patient.firstName, lastName: patient.lastName,
        uniquePatientId: patient.uniquePatientId, profilePictureFileId: patient.profilePictureFileId,
      })
      .from(regimenCycle)
      .innerJoin(regimen, eq(regimen.id, regimenCycle.regimenId))
      .innerJoin(patient, eq(patient.id, regimen.patientId))
      .where(and(
        eq(regimenCycle.scheduledDate, date),
        eq(patient.facilityId, facilityId),
        eq(regimenCycle.isDeleted, false),
        eq(regimen.isDeleted, false),
      ))
      .orderBy(regimenCycle.scheduledDate);
  }
  // "Active Regimen" per Patient File — the current one, not history. A patient could in
  // principle have more than one non-deleted regimen row over time (discontinued/completed
  // ones); this deliberately picks the single ACTIVE one, most-recently-started if somehow more
  // than one is active.
  async findActiveByPatient(patientId: string) {
    const rows = await db
      .select()
      .from(regimen)
      .where(and(eq(regimen.patientId, patientId), eq(regimen.status, "ACTIVE"), eq(regimen.isDeleted, false)))
      .orderBy(desc(regimen.startedAt))
      .limit(1);
    return rows[0] ?? null;
  }

  async findCyclesByRegimen(regimenId: string) {
    return db
      .select()
      .from(regimenCycle)
      .where(and(eq(regimenCycle.regimenId, regimenId), eq(regimenCycle.isDeleted, false)))
      .orderBy(regimenCycle.cycleNumber);
  }
}

export class VitalsRepository {
  // One row per vital_type, its most recent reading — backs both Patient File's vitals cards
  // and the Pre-call Briefing's "Latest Vitals" (same query, per
  // ONCOFLOW_PATIENT_DATA_MODELS.md's "build these once, not per-phase" instruction).
  async findLatestByPatient(patientId: string) {
    return db.execute<{
      id: string; vital_type: string; value: string; recorded_at: string; source: string;
    }>(sql`
      SELECT DISTINCT ON (vital_type) id, vital_type, value, recorded_at, source
      FROM vital_reading
      WHERE patient_id = ${patientId} AND is_deleted = false
      ORDER BY vital_type, recorded_at DESC
    `);
  }

  async findTrendByPatient(patientId: string, vitalType: string, limit: number) {
    return db
      .select()
      .from(vitalReading)
      .where(and(eq(vitalReading.patientId, patientId), eq(vitalReading.vitalType, vitalType as never), eq(vitalReading.isDeleted, false)))
      .orderBy(desc(vitalReading.recordedAt))
      .limit(limit);
  }

  async findAllReferenceRanges() {
    return db.select().from(vitalReferenceRange);
  }

  async insertReading(data: typeof vitalReading.$inferInsert) {
    const row = await db.insert(vitalReading).values(data).returning();
    return row[0]!;
  }
}

export class ClinicalMetricsRepository {
  // The current snapshot — supersededAt IS NULL, most recent recordedAt as a tiebreaker.
  async findCurrentByPatient(patientId: string) {
    const rows = await db
      .select()
      .from(clinicalMetricsSnapshot)
      .where(and(
        eq(clinicalMetricsSnapshot.patientId, patientId),
        isNull(clinicalMetricsSnapshot.supersededAt),
        eq(clinicalMetricsSnapshot.isDeleted, false),
      ))
      .orderBy(desc(clinicalMetricsSnapshot.recordedAt))
      .limit(1);
    return rows[0] ?? null;
  }

  async insertSnapshot(data: typeof clinicalMetricsSnapshot.$inferInsert) {
    const row = await db.insert(clinicalMetricsSnapshot).values(data).returning();
    return row[0]!;
  }

  async supersede(id: string, at: Date) {
    await db.update(clinicalMetricsSnapshot).set({ supersededAt: at, updatedAt: at }).where(eq(clinicalMetricsSnapshot.id, id));
  }

  async insertLabEntry(data: typeof nursingLabEntry.$inferInsert) {
    const row = await db.insert(nursingLabEntry).values(data).returning();
    return row[0]!;
  }

  async insertLabValues(data: (typeof nursingLabValue.$inferInsert)[]) {
    if (data.length === 0) return [];
    return db.insert(nursingLabValue).values(data).returning();
  }

  async findLabValuesForSnapshot(snapshotId: string) {
    const entryRows = await db
      .select()
      .from(nursingLabEntry)
      .where(and(eq(nursingLabEntry.clinicalMetricsSnapshotId, snapshotId), eq(nursingLabEntry.isDeleted, false)))
      .limit(1);
    const entry = entryRows[0];
    if (!entry) return [];

    return db
      .select({
        analyteCode: nursingLabValue.analyteCode,
        value: nursingLabValue.value,
        unit: nursingLabValue.unit,
        displayName: labAnalyteReference.displayName,
        normalLow: labAnalyteReference.normalLow,
        normalHigh: labAnalyteReference.normalHigh,
        criticalLow: labAnalyteReference.criticalLow,
        criticalHigh: labAnalyteReference.criticalHigh,
      })
      .from(nursingLabValue)
      .innerJoin(labAnalyteReference, eq(labAnalyteReference.analyteCode, nursingLabValue.analyteCode))
      .where(eq(nursingLabValue.nursingLabEntryId, entry.id));
  }
}

export class LabDocumentRepository {
  // Patient File's lab panel per Track 2: document metadata only, no analyte values, no
  // severity — "Last uploaded by patient · [date] · Approved by [admin name] · [date]".
  async findByPatientWithAdminReview(patientId: string) {
    return db
      .select({
        id: labDocument.id,
        uploadedAt: labDocument.uploadedAt,
        claimedCollectionDate: labDocument.claimedCollectionDate,
        workflowStatus: labDocument.workflowStatus,
        adminReviewedAt: labDocumentReview.reviewedAt,
        adminDecision: labDocumentReview.decision,
        adminName: user.email,
      })
      .from(labDocument)
      .leftJoin(
        labDocumentReview,
        and(eq(labDocumentReview.labDocumentId, labDocument.id), eq(labDocumentReview.stage, "ADMIN_DATE_CHECK")),
      )
      .leftJoin(user, eq(user.id, labDocumentReview.reviewedBy))
      .where(and(eq(labDocument.patientId, patientId), eq(labDocument.isDeleted, false)))
      .orderBy(desc(labDocument.uploadedAt));
  }
}

// Per ONCOFLOW_PATIENT_DATA_MODELS.md's "Clinical Activity Log — not a new table": a union
// query across tables that already exist, not its own audit table (writing to two places every
// time a note/document is created is exactly the staffing-conflict-severity duplication bug
// this project already learned from once). Raw SQL because it unions two differently-shaped
// tables (clinical_note joined through medical_record, and lab_document directly) — not
// something Drizzle's query builder expresses cleanly.
export class ActivityLogRepository {
  async findByPatient(patientId: string, limit: number) {
    return db.execute<{
      activity_type: string; timestamp: string; provider: string | null; status: string | null;
    }>(sql`
      SELECT 'CLINICAL_NOTE' AS activity_type, cn.created_at AS timestamp, u.email AS provider, NULL AS status
      FROM clinical_note cn
      JOIN medical_record mr ON mr.id = cn.medical_record_id
      JOIN "user" u ON u.id = cn.author_id
      WHERE mr.patient_id = ${patientId} AND cn.is_deleted = false

      UNION ALL

      SELECT 'LAB_DOCUMENT' AS activity_type, ld.uploaded_at AS timestamp, u2.email AS provider, ld.workflow_status AS status
      FROM lab_document ld
      JOIN "user" u2 ON u2.id = ld.uploaded_by
      WHERE ld.patient_id = ${patientId} AND ld.is_deleted = false

      ORDER BY timestamp DESC
      LIMIT ${limit}
    `);
  }
}

export class CaseLockRepository {
  async findActiveByPatient(patientId: string) {
    const rows = await db
      .select()
      .from(caseLock)
      .where(and(eq(caseLock.patientId, patientId), eq(caseLock.status, "LOCKED")))
      .orderBy(desc(caseLock.triggeredAt))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(data: typeof caseLock.$inferInsert) {
    const row = await db.insert(caseLock).values(data).returning();
    return row[0]!;
  }
}
