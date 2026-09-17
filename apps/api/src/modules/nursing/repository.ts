import { db } from "../../db/index.js";
import { eq, and, desc, isNull, ne } from "drizzle-orm";
import { nursingCase, nursingCaseReview, nursingDocumentationSheet, uploadSecurityIncident } from "./schema.js";

export class NursingCaseRepository {
  async findById(id: string) {
    const row = await db.select().from(nursingCase).where(and(eq(nursingCase.id, id), isNull(nursingCase.deletedAt))).limit(1);
    return row[0] ?? null;
  }

  // A regimen cycle should have at most one live (non-closed) case open against it at a time —
  // this is what lets the service refuse to double-start a case for the same visitation.
  async findOpenByRegimenCycle(regimenCycleId: string) {
    const row = await db
      .select()
      .from(nursingCase)
      .where(and(eq(nursingCase.regimenCycleId, regimenCycleId), ne(nursingCase.status, "CLOSED"), isNull(nursingCase.deletedAt)))
      .limit(1);
    return row[0] ?? null;
  }

  async findByStartedBy(startedBy: string) {
    return db
      .select()
      .from(nursingCase)
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

  async create(data: typeof nursingCase.$inferInsert) {
    const row = await db.insert(nursingCase).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof nursingCase.$inferInsert>) {
    const row = await db.update(nursingCase).set({ ...data, updatedAt: new Date() }).where(eq(nursingCase.id, id)).returning();
    return row[0] ?? null;
  }
}

export class NursingCaseReviewRepository {
  async create(data: typeof nursingCaseReview.$inferInsert) {
    const row = await db.insert(nursingCaseReview).values(data).returning();
    return row[0]!;
  }

  async findByCase(nursingCaseId: string) {
    return db.select().from(nursingCaseReview).where(eq(nursingCaseReview.nursingCaseId, nursingCaseId)).orderBy(desc(nursingCaseReview.reviewedAt));
  }
}

export class NursingDocumentationSheetRepository {
  async create(data: typeof nursingDocumentationSheet.$inferInsert) {
    const row = await db.insert(nursingDocumentationSheet).values(data).returning();
    return row[0]!;
  }

  async findByCase(nursingCaseId: string) {
    const row = await db
      .select()
      .from(nursingDocumentationSheet)
      .where(and(eq(nursingDocumentationSheet.nursingCaseId, nursingCaseId), isNull(nursingDocumentationSheet.deletedAt)))
      .limit(1);
    return row[0] ?? null;
  }
}

export class UploadSecurityIncidentRepository {
  async create(data: typeof uploadSecurityIncident.$inferInsert) {
    const row = await db.insert(uploadSecurityIncident).values(data).returning();
    return row[0]!;
  }

  async findRecent(limit: number) {
    return db.select().from(uploadSecurityIncident).orderBy(desc(uploadSecurityIncident.createdAt)).limit(limit);
  }
}
