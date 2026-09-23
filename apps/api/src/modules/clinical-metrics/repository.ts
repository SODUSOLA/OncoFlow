import { db } from "../../db/index.js";
import { eq, and, desc, isNull, lte, sql } from "drizzle-orm";
import {
  regimen, regimenCycle, vitalReading, vitalReferenceRange,
  clinicalMetricsSnapshot, nursingLabEntry, nursingLabValue, labAnalyteReference,
  labDocument, labDocumentReview, caseLock,
} from "./schema.js";
import { user } from "../auth/schema.js";
import { patient } from "../patient/schema.js";

// Data access for regimens and their cycles.
export class RegimenRepository {
  // Every cycle at a facility on a date, joined to the patient fields the cards need to avoid N+1 fetches.
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

  // Still-SCHEDULED cycles due on or before a date (today's due cycles plus any never actioned earlier), oldest first
  // so a nurse works through the backlog before today's. A cycle that slipped past its exact date used to vanish
  // from both the schedule and the new-case wizard, since findCyclesByFacilityAndDate matches the date exactly.
  async findDueCyclesByFacility(facilityId: string, throughDate: string) {
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
        lte(regimenCycle.scheduledDate, throughDate),
        eq(regimenCycle.status, "SCHEDULED"),
        eq(patient.facilityId, facilityId),
        eq(regimenCycle.isDeleted, false),
        eq(regimen.isDeleted, false),
      ))
      .orderBy(regimenCycle.scheduledDate);
  }

  // The single ACTIVE regimen for the Patient File, most recently started if several are active.
  async findActiveByPatient(patientId: string) {
    const rows = await db
      .select()
      .from(regimen)
      .where(and(eq(regimen.patientId, patientId), eq(regimen.status, "ACTIVE"), eq(regimen.isDeleted, false)))
      .orderBy(desc(regimen.startedAt))
      .limit(1);
    return rows[0] ?? null;
  }

  // Lists a regimen's cycles.
  async findCyclesByRegimen(regimenId: string) {
    return db
      .select()
      .from(regimenCycle)
      .where(and(eq(regimenCycle.regimenId, regimenId), eq(regimenCycle.isDeleted, false)))
      .orderBy(regimenCycle.cycleNumber);
  }
}

// Data access for vital readings and reference ranges.
export class VitalsRepository {
  // Latest reading per vital type, shared by Patient File and the Pre-call Briefing.
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

  // Lists a patient's readings for one vital type, newest first.
  async findTrendByPatient(patientId: string, vitalType: string, limit: number) {
    return db
      .select()
      .from(vitalReading)
      .where(and(eq(vitalReading.patientId, patientId), eq(vitalReading.vitalType, vitalType as never), eq(vitalReading.isDeleted, false)))
      .orderBy(desc(vitalReading.recordedAt))
      .limit(limit);
  }

  // Returns all vital reference ranges.
  async findAllReferenceRanges() {
    return db.select().from(vitalReferenceRange);
  }

  // Inserts a vital reading.
  async insertReading(data: typeof vitalReading.$inferInsert) {
    const row = await db.insert(vitalReading).values(data).returning();
    return row[0]!;
  }
}

// Data access for clinical metrics snapshots and nursing lab entries.
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

  // Inserts a metrics snapshot.
  async insertSnapshot(data: typeof clinicalMetricsSnapshot.$inferInsert) {
    const row = await db.insert(clinicalMetricsSnapshot).values(data).returning();
    return row[0]!;
  }

  // Marks a snapshot superseded at the given time.
  async supersede(id: string, at: Date) {
    await db.update(clinicalMetricsSnapshot).set({ supersededAt: at, updatedAt: at }).where(eq(clinicalMetricsSnapshot.id, id));
  }

  // Inserts a nursing lab entry.
  async insertLabEntry(data: typeof nursingLabEntry.$inferInsert) {
    const row = await db.insert(nursingLabEntry).values(data).returning();
    return row[0]!;
  }

  // Inserts nursing lab values in bulk.
  async insertLabValues(data: (typeof nursingLabValue.$inferInsert)[]) {
    if (data.length === 0) return [];
    return db.insert(nursingLabValue).values(data).returning();
  }

  // Returns the lab values recorded under a snapshot.
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

// Data access for uploaded lab documents.
export class LabDocumentRepository {
  // Patient File lab panel: document metadata with the admin review, no analyte values or severity.
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

// Clinical Activity Log is a raw-SQL union of existing tables rather than a new table, since the two sources have different shapes.
export class ActivityLogRepository {
  // Returns a patient's most recent activity entries across notes and lab documents.
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

// Data access for case locks.
export class CaseLockRepository {
  // Finds a patient's active (unresolved) case lock.
  async findActiveByPatient(patientId: string) {
    const rows = await db
      .select()
      .from(caseLock)
      .where(and(eq(caseLock.patientId, patientId), eq(caseLock.status, "LOCKED")))
      .orderBy(desc(caseLock.triggeredAt))
      .limit(1);
    return rows[0] ?? null;
  }

  // Inserts a case lock.
  async create(data: typeof caseLock.$inferInsert) {
    const row = await db.insert(caseLock).values(data).returning();
    return row[0]!;
  }
}
