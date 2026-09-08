import { db } from "../../db/index.js";
import { eq, sql, and, gt, inArray, desc } from "drizzle-orm";
import { countdownCase, triageChecklist, prescription, labRequest, labResult, clinicalDecision, medicalRecord, clinicalNote } from "./schema.js";

export class CountdownCaseRepository {
  async findById(id: string) {
    const row = await db
      .select()
      .from(countdownCase)
      .where(sql`${countdownCase.id} = ${id} AND ${countdownCase.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  async findByPatient(patientId: string) {
    return db
      .select()
      .from(countdownCase)
      .where(and(eq(countdownCase.patientId, patientId), eq(countdownCase.isDeleted, false)))
      .orderBy(countdownCase.createdAt);
  }

  // Deliberately narrow: only cases still counting down (ACTIVE, day > 0). Used by
  // CountdownJobService (the daily advance/escalate job — must never reprocess an already-
  // escalated case) and CalendarService (only cases still awaiting a calendar slot). Do not
  // widen this for the admin overview's needs — see findForOverview below instead.
  async findActive() {
    return db
      .select()
      .from(countdownCase)
      .where(and(eq(countdownCase.status, "ACTIVE"), eq(countdownCase.isDeleted, false), gt(countdownCase.currentDay, 0)));
  }

  // The admin oversight board (regional-admin Dashboard) needs the opposite scope from
  // findActive: it specifically wants to see day-0 and ESCALATED cases too (that's the entire
  // point of an SLA-breach view) — everything still open, excluding only resolved cases
  // (CLEARED/DECLINED).
  async findForOverview() {
    return db
      .select()
      .from(countdownCase)
      .where(and(inArray(countdownCase.status, ["ACTIVE", "ESCALATED"]), eq(countdownCase.isDeleted, false)));
  }

  // countdown_case has no facility_id of its own (only patient_id) — callers that need
  // facility scoping (e.g. the unified calendar, FR-24) resolve the patient IDs for a
  // facility first, then batch-fetch here rather than joining across module schemas.
  async findActiveByPatientIds(patientIds: string[]) {
    if (patientIds.length === 0) return [];
    return db
      .select()
      .from(countdownCase)
      .where(and(inArray(countdownCase.patientId, patientIds), eq(countdownCase.status, "ACTIVE"), eq(countdownCase.isDeleted, false)));
  }

  async create(data: typeof countdownCase.$inferInsert) {
    const row = await db.insert(countdownCase).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof countdownCase.$inferInsert>) {
    const row = await db
      .update(countdownCase)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(countdownCase.id, id), eq(countdownCase.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }
}

export class TriageChecklistRepository {
  async findById(id: string) {
    const row = await db.select().from(triageChecklist).where(eq(triageChecklist.id, id)).limit(1);
    return row[0] ?? null;
  }

  async findByConversation(conversationId: string) {
    const row = await db
      .select()
      .from(triageChecklist)
      .where(eq(triageChecklist.conversationId, conversationId))
      .limit(1);
    return row[0] ?? null;
  }

  // [append-only] — no update()/delete(); the 1:1-per-conversation uniqueness is enforced
  // at the service layer (findByConversation check before create) so the caller gets a clean
  // domain error instead of a raw DB unique-constraint violation (F3.2 DoD).
  async create(data: typeof triageChecklist.$inferInsert) {
    const row = await db.insert(triageChecklist).values(data).returning();
    return row[0]!;
  }
}

export class PrescriptionRepository {
  async findById(id: string) {
    const row = await db
      .select()
      .from(prescription)
      .where(sql`${prescription.id} = ${id} AND ${prescription.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  async findByPatient(patientId: string) {
    return db
      .select()
      .from(prescription)
      .where(and(eq(prescription.patientId, patientId), eq(prescription.isDeleted, false)))
      .orderBy(prescription.createdAt);
  }

  async create(data: typeof prescription.$inferInsert) {
    const row = await db.insert(prescription).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof prescription.$inferInsert>) {
    const row = await db
      .update(prescription)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(prescription.id, id), eq(prescription.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }
}

export class LabRequestRepository {
  async findById(id: string) {
    const row = await db
      .select()
      .from(labRequest)
      .where(sql`${labRequest.id} = ${id} AND ${labRequest.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  async findByPatient(patientId: string) {
    return db
      .select()
      .from(labRequest)
      .where(and(eq(labRequest.patientId, patientId), eq(labRequest.isDeleted, false)))
      .orderBy(labRequest.createdAt);
  }

  async create(data: typeof labRequest.$inferInsert) {
    const row = await db.insert(labRequest).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof labRequest.$inferInsert>) {
    const row = await db
      .update(labRequest)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(labRequest.id, id), eq(labRequest.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }
}

export class LabResultRepository {
  async findById(id: string) {
    const row = await db
      .select()
      .from(labResult)
      .where(sql`${labResult.id} = ${id} AND ${labResult.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  async findByPatient(patientId: string) {
    return db
      .select()
      .from(labResult)
      .where(and(eq(labResult.patientId, patientId), eq(labResult.isDeleted, false)))
      .orderBy(labResult.createdAt);
  }

  async findByRequest(requestId: string) {
    return db
      .select()
      .from(labResult)
      .where(and(eq(labResult.requestId, requestId), eq(labResult.isDeleted, false)));
  }

  // Backs F3.5's duplicate-detection rule — uses the same (file_hash, patient_id, test_date)
  // composite index the table was built with (lab_result_file_hash_patient_test_date_idx),
  // leading with file_hash and patient_id since that's the actual match condition here.
  async findByHashAndPatient(fileHash: string, patientId: string) {
    return db
      .select()
      .from(labResult)
      .where(and(eq(labResult.fileHash, fileHash), eq(labResult.patientId, patientId), eq(labResult.isDeleted, false)));
  }

  async create(data: typeof labResult.$inferInsert) {
    const row = await db.insert(labResult).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof labResult.$inferInsert>) {
    const row = await db
      .update(labResult)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(labResult.id, id), eq(labResult.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }
}

export class ClinicalDecisionRepository {
  async findById(id: string) {
    const row = await db
      .select()
      .from(clinicalDecision)
      .where(sql`${clinicalDecision.id} = ${id} AND ${clinicalDecision.isDeleted} = false`)
      .limit(1);
    return row[0] ?? null;
  }

  // UNIQUE(lab_result_id) — one decision row per lab result, ever.
  async findByLabResult(labResultId: string) {
    const row = await db
      .select()
      .from(clinicalDecision)
      .where(and(eq(clinicalDecision.labResultId, labResultId), eq(clinicalDecision.isDeleted, false)))
      .limit(1);
    return row[0] ?? null;
  }

  async create(data: typeof clinicalDecision.$inferInsert) {
    const row = await db.insert(clinicalDecision).values(data).returning();
    return row[0]!;
  }

  async update(id: string, data: Partial<typeof clinicalDecision.$inferInsert>) {
    const row = await db
      .update(clinicalDecision)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(clinicalDecision.id, id), eq(clinicalDecision.isDeleted, false)))
      .returning();
    return row[0] ?? null;
  }
}

export class MedicalRecordRepository {
  async create(data: typeof medicalRecord.$inferInsert) {
    const row = await db.insert(medicalRecord).values(data).returning();
    return row[0]!;
  }
}

// The "Add Clinical Note" action on the Consulting Oncologist shell — a free-text note tied to
// a patient. Every note gets its own MedicalRecord (recordType "CONSULT_NOTE") rather than
// reusing one shared record per patient: MedicalRecord.summary is itself real content (not a
// container title), so a shared record would mean each new note silently overwrote the last
// summary. One record per note keeps that field meaningful.
export class ClinicalNoteRepository {
  async create(data: typeof clinicalNote.$inferInsert) {
    const row = await db.insert(clinicalNote).values(data).returning();
    return row[0]!;
  }

  async findByPatient(patientId: string) {
    return db
      .select({
        id: clinicalNote.id,
        note: clinicalNote.note,
        authorId: clinicalNote.authorId,
        createdAt: clinicalNote.createdAt,
        recordType: medicalRecord.recordType,
      })
      .from(clinicalNote)
      .innerJoin(medicalRecord, eq(medicalRecord.id, clinicalNote.medicalRecordId))
      .where(and(eq(medicalRecord.patientId, patientId), eq(clinicalNote.isDeleted, false)))
      .orderBy(desc(clinicalNote.createdAt));
  }

  // Phase 6's Post-call Summary — "has this specific meeting already been finalized" is a direct
  // FK lookup (MedicalRecord.sourceMeetingId), not a date-proximity guess against a patient who
  // may have several same-day appointments.
  async findByMeeting(sourceMeetingId: string) {
    const row = await db
      .select({
        id: clinicalNote.id,
        note: clinicalNote.note,
        authorId: clinicalNote.authorId,
        createdAt: clinicalNote.createdAt,
      })
      .from(clinicalNote)
      .innerJoin(medicalRecord, eq(medicalRecord.id, clinicalNote.medicalRecordId))
      .where(and(eq(medicalRecord.sourceMeetingId, sourceMeetingId), eq(clinicalNote.isDeleted, false)))
      .limit(1);
    return row[0] ?? null;
  }
}
