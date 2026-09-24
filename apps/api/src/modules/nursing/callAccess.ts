import { db } from "../../db/index.js";
import { and, desc, eq, isNull } from "drizzle-orm";
import { nursingCase } from "./schema.js";

// A nursing officer's call to a patient is tied to their visit: once the officer's latest case with that
// patient is CLOSED (and they have no other open one), there's nothing left to call about until a new case
// is started. Officers with no case yet with the patient aren't blocked — a call before a visit is fine.
// Schema-only imports, like editability.ts, so the patient module can use it without a module cycle.
export async function isVisitClosedOut(officerId: string, patientId: string): Promise<boolean> {
  const [latest] = await db.select({ status: nursingCase.status }).from(nursingCase)
    .where(and(eq(nursingCase.startedBy, officerId), eq(nursingCase.patientId, patientId), isNull(nursingCase.deletedAt)))
    .orderBy(desc(nursingCase.startedAt)).limit(1);
  return latest?.status === "CLOSED";
}

export const CALL_AFTER_CLOSE_MESSAGE = "This patient's case is closed — calls are only allowed while a case is open";
