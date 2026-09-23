import { db } from "../../db/index.js";
import { eq, and, desc, isNull, ne } from "drizzle-orm";
import { nursingCase, nursingCaseReview, nursingDocumentationSheet, uploadSecurityIncident } from "./schema.js";
import { patient } from "../patient/schema.js";

// Data access for nursing cases.
export class NursingCaseRepository {
  // Finds a non-deleted case by id.
  async findById(id: string) {
    const row = await db.select().from(nursingCase).where(and(eq(nursingCase.id, id), isNull(nursingCase.deletedAt))).limit(1);
    return row[0] ?? null;
  }

  // Same, with the patient fields the case detail page needs alongside it — a separate method (rather than
  // widening findById everywhere) so submitDocumentationSheet/review keep working off the plain row shape.
  async findByIdWithPatient(id: string) {
    const row = await db
      .select({
        id: nursingCase.id, patientId: nursingCase.patientId, regimenCycleId: nursingCase.regimenCycleId,
        startedBy: nursingCase.startedBy, startedAt: nursingCase.startedAt, status: nursingCase.status,
        closedBy: nursingCase.closedBy, closedAt: nursingCase.closedAt,
        patientFirstName: patient.firstName, patientLastName: patient.lastName, patientUniqueId: patient.uniquePatientId,
        patientDob: patient.dob, patientGender: patient.gender,
      })
      .from(nursingCase)
      .innerJoin(patient, eq(patient.id, nursingCase.patientId))
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

  // The QA review queue — every case waiting on a decision, across nursing officers.
  async findPendingReview() {
    return db
      .select()
      .from(nursingCase)
      .where(and(eq(nursingCase.status, "PENDING_QA_REVIEW"), isNull(nursingCase.deletedAt)))
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
