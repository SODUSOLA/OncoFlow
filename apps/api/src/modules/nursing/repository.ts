import { db } from "../../db/index.js";
import { eq, and, desc, isNull, ne, gte } from "drizzle-orm";
import { nursingCase, nursingCaseReview, nursingDocumentationSheet, uploadSecurityIncident, identityMismatchReport } from "./schema.js";
import { patient } from "../patient/schema.js";
import { regimenCycle, clinicalMetricsSnapshot } from "../clinical-metrics/schema.js";
import { user } from "../auth/schema.js";

// Data access for nursing cases.
export class NursingCaseRepository {
  // Finds a non-deleted case by id.
  async findById(id: string) {
    const row = await db.select().from(nursingCase).where(and(eq(nursingCase.id, id), isNull(nursingCase.deletedAt))).limit(1);
    return row[0] ?? null;
  }

  // Same, with the patient and cycle fields the case detail page needs alongside it — a separate method
  // (rather than widening findById everywhere) so submitDocumentationSheet/review keep working off the
  // plain row shape.
  async findByIdWithPatient(id: string) {
    const row = await db
      .select({
        id: nursingCase.id, patientId: nursingCase.patientId, regimenCycleId: nursingCase.regimenCycleId,
        startedBy: nursingCase.startedBy, startedAt: nursingCase.startedAt, status: nursingCase.status,
        closedBy: nursingCase.closedBy, closedAt: nursingCase.closedAt, identityVerifiedAt: nursingCase.identityVerifiedAt,
        patientFirstName: patient.firstName, patientLastName: patient.lastName, patientUniqueId: patient.uniquePatientId,
        patientFacilityId: patient.facilityId,
        patientDob: patient.dob, patientGender: patient.gender, patientProfilePictureFileId: patient.profilePictureFileId,
        cycleNumber: regimenCycle.cycleNumber,
      })
      .from(nursingCase)
      .innerJoin(patient, eq(patient.id, nursingCase.patientId))
      .innerJoin(regimenCycle, eq(regimenCycle.id, nursingCase.regimenCycleId))
      .where(and(eq(nursingCase.id, id), isNull(nursingCase.deletedAt)))
      .limit(1);
    return row[0] ?? null;
  }

  // A cycle can have at most one open case, which lets the service refuse to double-start a visitation.
  async findOpenByRegimenCycle(regimenCycleId: string) {
    const row = await db
      .select()
      .from(nursingCase)
      .where(and(eq(nursingCase.regimenCycleId, regimenCycleId), ne(nursingCase.status, "CLOSED"), isNull(nursingCase.deletedAt)))
      .limit(1);
    return row[0] ?? null;
  }

  // Lists cases started by a nurse, with patient fields so "My Cases" can show a name instead of a bare id.
  async findByStartedBy(startedBy: string) {
    return db
      .select({
        id: nursingCase.id, patientId: nursingCase.patientId, regimenCycleId: nursingCase.regimenCycleId,
        startedBy: nursingCase.startedBy, startedAt: nursingCase.startedAt, status: nursingCase.status,
        closedBy: nursingCase.closedBy, closedAt: nursingCase.closedAt,
        patientFirstName: patient.firstName, patientLastName: patient.lastName, patientUniqueId: patient.uniquePatientId,
      })
      .from(nursingCase)
      .innerJoin(patient, eq(patient.id, nursingCase.patientId))
      .where(and(eq(nursingCase.startedBy, startedBy), isNull(nursingCase.deletedAt)))
      .orderBy(desc(nursingCase.startedAt));
  }

  // Every case ever opened for a patient, across every nurse who's treated them — the "patient folder" case
  // history, not just "my cases". Most recent first so the latest visitation (closed or not) leads.
  async findByPatient(patientId: string) {
    return db
      .select({
        id: nursingCase.id, patientId: nursingCase.patientId, regimenCycleId: nursingCase.regimenCycleId,
        startedBy: nursingCase.startedBy, startedAt: nursingCase.startedAt, status: nursingCase.status,
        closedBy: nursingCase.closedBy, closedAt: nursingCase.closedAt,
        cycleNumber: regimenCycle.cycleNumber, startedByEmail: user.email,
      })
      .from(nursingCase)
      .innerJoin(regimenCycle, eq(regimenCycle.id, nursingCase.regimenCycleId))
      .innerJoin(user, eq(user.id, nursingCase.startedBy))
      .where(and(eq(nursingCase.patientId, patientId), isNull(nursingCase.deletedAt)))
      .orderBy(desc(nursingCase.startedAt));
  }

  // The QA review queue — every case waiting on a decision, across nursing officers, oldest first so the
  // longest-waiting patient is reviewed first.
  async findPendingReview(facilityId: string | null) {
    return db
      .select({
        id: nursingCase.id, patientId: nursingCase.patientId, regimenCycleId: nursingCase.regimenCycleId,
        startedBy: nursingCase.startedBy, startedAt: nursingCase.startedAt, status: nursingCase.status,
        closedBy: nursingCase.closedBy, closedAt: nursingCase.closedAt,
        patientFirstName: patient.firstName, patientLastName: patient.lastName, patientUniqueId: patient.uniquePatientId,
        cycleNumber: regimenCycle.cycleNumber, startedByEmail: user.email,
      })
      .from(nursingCase)
      .innerJoin(patient, eq(patient.id, nursingCase.patientId))
      .innerJoin(regimenCycle, eq(regimenCycle.id, nursingCase.regimenCycleId))
      .innerJoin(user, eq(user.id, nursingCase.startedBy))
      .where(and(
        eq(nursingCase.status, "PENDING_QA_REVIEW"), isNull(nursingCase.deletedAt),
        // A QA officer sees only their own facility's queue; null means unrestricted.
        facilityId ? eq(patient.facilityId, facilityId) : undefined,
      ))
      .orderBy(nursingCase.startedAt);
  }

  // Inserts a case.
  async create(data: typeof nursingCase.$inferInsert) {
    const row = await db.insert(nursingCase).values(data).returning();
    return row[0]!;
  }

  // Updates a case.
  async update(id: string, data: Partial<typeof nursingCase.$inferInsert>) {
    const row = await db.update(nursingCase).set({ ...data, updatedAt: new Date() }).where(eq(nursingCase.id, id)).returning();
    return row[0] ?? null;
  }
}

// Data access for QA case reviews.
export class NursingCaseReviewRepository {
  // Inserts a review.
  async create(data: typeof nursingCaseReview.$inferInsert) {
    const row = await db.insert(nursingCaseReview).values(data).returning();
    return row[0]!;
  }

  // Lists a case's reviews.
  async findByCase(nursingCaseId: string) {
    return db.select().from(nursingCaseReview).where(eq(nursingCaseReview.nursingCaseId, nursingCaseId)).orderBy(desc(nursingCaseReview.reviewedAt));
  }
}

// Data access for documentation sheets.
export class NursingDocumentationSheetRepository {
  // Inserts a documentation sheet.
  async create(data: typeof nursingDocumentationSheet.$inferInsert) {
    const row = await db.insert(nursingDocumentationSheet).values(data).returning();
    return row[0]!;
  }

  // Finds the documentation sheet for a case.
  async findByCase(nursingCaseId: string) {
    const row = await db
      .select()
      .from(nursingDocumentationSheet)
      .where(and(eq(nursingDocumentationSheet.nursingCaseId, nursingCaseId), isNull(nursingDocumentationSheet.deletedAt)))
      .limit(1);
    return row[0] ?? null;
  }

  // Updates a case's documentation sheet — used when a nurse resubmits after QA sends the case back.
  async update(id: string, data: Partial<typeof nursingDocumentationSheet.$inferInsert>) {
    const row = await db
      .update(nursingDocumentationSheet)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(nursingDocumentationSheet.id, id))
      .returning();
    return row[0] ?? null;
  }
}

// Data access for upload security incidents.
export class UploadSecurityIncidentRepository {
  // Inserts a security incident.
  async create(data: typeof uploadSecurityIncident.$inferInsert) {
    const row = await db.insert(uploadSecurityIncident).values(data).returning();
    return row[0]!;
  }

  // Lists the most recent security incidents.
  async findRecent(limit: number) {
    return db.select().from(uploadSecurityIncident).orderBy(desc(uploadSecurityIncident.createdAt)).limit(limit);
  }
}

// Data access for identity mismatch reports.
export class IdentityMismatchReportRepository {
  // Inserts a report.
  async create(data: typeof identityMismatchReport.$inferInsert) {
    const row = await db.insert(identityMismatchReport).values(data).returning();
    return row[0]!;
  }
}

// Whether a biometrics/lab snapshot exists for a visitation, recorded since a moment in time.
export class CaseMetricsRepository {
  // Latest snapshot for the cycle recorded at or after `since` — proof the nurse entered weight, height and
  // creatinine (the snapshot can't exist without them) for this round of documentation.
  async findSnapshotSince(regimenCycleId: string, since: Date) {
    const rows = await db.select({ id: clinicalMetricsSnapshot.id }).from(clinicalMetricsSnapshot)
      .where(and(
        eq(clinicalMetricsSnapshot.regimenCycleId, regimenCycleId), eq(clinicalMetricsSnapshot.isDeleted, false),
        gte(clinicalMetricsSnapshot.recordedAt, since),
      )).limit(1);
    return rows[0] ?? null;
  }
}
