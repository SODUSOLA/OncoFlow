import { db } from "../../db/index.js";
import { eq, desc, and, isNull, ne } from "drizzle-orm";
import { nursingCase, nursingCaseReview, nursingDocumentationSheet } from "./schema.js";

// The one rule for whether a nurse may still change a case: open (STARTED) always; once submitted
// (PENDING_QA_REVIEW) it's frozen — no documentation, verification, drug logging or metrics — until QA
// sends it back with REQUIREMENTS_INCOMPLETE, and it freezes again the moment the nurse resubmits (the
// sheet's updatedAt moves past that review). CLOSED is never editable.
//
// Lives in its own file, importing only schema, because drug-supply, clinical-metrics and the nursing
// service all need it and importing nursing's index from the first two would be a cycle.
export async function isCaseEditable(caseId: string): Promise<boolean> {
  const [row] = await db.select({ status: nursingCase.status }).from(nursingCase)
    .where(and(eq(nursingCase.id, caseId), isNull(nursingCase.deletedAt))).limit(1);
  if (!row) return false;
  if (row.status === "CLOSED") return false;
  if (row.status === "STARTED") return true;

  const [review] = await db.select().from(nursingCaseReview)
    .where(eq(nursingCaseReview.nursingCaseId, caseId)).orderBy(desc(nursingCaseReview.reviewedAt)).limit(1);
  if (!review || review.decision !== "REQUIREMENTS_INCOMPLETE") return false;
  const [sheet] = await db.select({ updatedAt: nursingDocumentationSheet.updatedAt }).from(nursingDocumentationSheet)
    .where(and(eq(nursingDocumentationSheet.nursingCaseId, caseId), isNull(nursingDocumentationSheet.deletedAt))).limit(1);
  return !sheet || sheet.updatedAt <= review.reviewedAt;
}

// True when the live case on a regimen cycle exists and is frozen — for writes (like the biometrics/lab
// snapshot) that reference a cycle rather than a case.
export async function isCycleFrozenByCase(regimenCycleId: string): Promise<boolean> {
  const [row] = await db.select({ id: nursingCase.id }).from(nursingCase)
    .where(and(eq(nursingCase.regimenCycleId, regimenCycleId), ne(nursingCase.status, "CLOSED"), isNull(nursingCase.deletedAt))).limit(1);
  return row ? !(await isCaseEditable(row.id)) : false;
}

export interface WriteRefusal { status: number; message: string }

// Guard for a nursing officer's case-scoped writes (vitals): they must name their own case, for this patient,
// and it must still be editable. Returns the refusal to send, or null when the write may proceed.
export async function checkNurseCaseWrite(o: { callerId: string; patientId: string; nursingCaseId?: string }): Promise<WriteRefusal | null> {
  if (!o.nursingCaseId) return { status: 400, message: "Record vitals against a case (nursingCaseId is required)" };
  const [row] = await db.select().from(nursingCase).where(and(eq(nursingCase.id, o.nursingCaseId), isNull(nursingCase.deletedAt))).limit(1);
  if (!row) return { status: 404, message: "Nursing case not found" };
  if (row.startedBy !== o.callerId) return { status: 403, message: "You can only record against your own case" };
  if (row.patientId !== o.patientId) return { status: 400, message: "That case is for a different patient" };
  if (!(await isCaseEditable(row.id))) return { status: 409, message: CASE_LOCKED_MESSAGE };
  return null;
}

// Same, for writes that name a regimen cycle (the biometrics/lab snapshot): the cycle needs a live case of
// the caller's, for this patient, that's still editable.
export async function checkNurseCycleWrite(o: { callerId: string; patientId: string; regimenCycleId?: string }): Promise<WriteRefusal | null> {
  if (!o.regimenCycleId) return { status: 400, message: "Record biometrics against a visitation (regimenCycleId is required)" };
  const [row] = await db.select().from(nursingCase)
    .where(and(eq(nursingCase.regimenCycleId, o.regimenCycleId), ne(nursingCase.status, "CLOSED"), isNull(nursingCase.deletedAt))).limit(1);
  if (!row) return { status: 409, message: "No open case for this visitation — start the case first" };
  if (row.startedBy !== o.callerId) return { status: 403, message: "You can only record against your own case" };
  if (row.patientId !== o.patientId) return { status: 400, message: "That visitation is for a different patient" };
  if (!(await isCaseEditable(row.id))) return { status: 409, message: CASE_LOCKED_MESSAGE };
  return null;
}

export const CASE_LOCKED_MESSAGE = "This case is awaiting QA review and can't be changed unless QA sends it back";
