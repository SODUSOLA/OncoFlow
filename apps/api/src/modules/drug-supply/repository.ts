import { and, desc, eq, gte, inArray, isNull, lt, max, ne, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/index.js";
import { user } from "../auth/schema.js";
import { facility } from "../facility/schema.js";
import { drug } from "../inventory/schema.js";
import { nursingCase } from "../nursing/schema.js";
import {
  drugRequest, drugRequestLine, drugDispatch, drugDispatchLine, drugStockLedgerEntry,
  regionalDrugStockLedgerEntry, drugUsage, drugLossReport, drugStockReconciliation,
} from "./schema.js";

// Either the pool or an open transaction, so the same reads work inside atomic writes.
export type DbOrTx = Pick<typeof db, "select" | "insert" | "update" | "execute">;

const officerQty = sql<number>`coalesce(sum(${drugStockLedgerEntry.quantityDelta}), 0)::int`;
const regionalQty = sql<number>`coalesce(sum(${regionalDrugStockLedgerEntry.quantityDelta}), 0)::int`;

// Data access for the drug supply chain; stock is always a ledger SUM, never a stored counter.
export class DrugSupplyRepository {
  // Current stock per drug for one officer, optionally as of a cutoff instant.
  async officerStock(officerId: string, cutoff?: Date, executor: DbOrTx = db) {
    const filters: SQL[] = [eq(drugStockLedgerEntry.nursingOfficerId, officerId)];
    if (cutoff) filters.push(lt(drugStockLedgerEntry.createdAt, cutoff));
    return executor
      .select({
        drugId: drug.id, drugName: drug.name, drugStrength: drug.strength,
        reorderThreshold: drug.reorderThreshold, quantity: officerQty,
      })
      .from(drugStockLedgerEntry)
      .innerJoin(drug, eq(drugStockLedgerEntry.drugId, drug.id))
      .where(and(...filters))
      .groupBy(drug.id, drug.name, drug.strength, drug.reorderThreshold)
      .orderBy(drug.name);
  }

  // Stock per officer and drug for officers in the given facilities (null means all), optionally as of a cutoff.
  async officersStock(facilityIds: string[] | null, cutoff?: Date) {
    if (facilityIds && facilityIds.length === 0) return [];
    const filters: SQL[] = [];
    if (facilityIds) filters.push(inArray(user.facilityId, facilityIds));
    if (cutoff) filters.push(lt(drugStockLedgerEntry.createdAt, cutoff));
    return db
      .select({
        officerId: user.id, officerEmail: user.email, facilityId: user.facilityId,
        drugId: drug.id, drugName: drug.name, drugStrength: drug.strength,
        reorderThreshold: drug.reorderThreshold, quantity: officerQty,
        // The latest ledger movement for this officer's stock of the drug, i.e. when it last changed.
        lastActivityAt: max(drugStockLedgerEntry.createdAt),
      })
      .from(drugStockLedgerEntry)
      .innerJoin(user, eq(drugStockLedgerEntry.nursingOfficerId, user.id))
      .innerJoin(drug, eq(drugStockLedgerEntry.drugId, drug.id))
      .where(filters.length ? and(...filters) : undefined)
      .groupBy(user.id, user.email, user.facilityId, drug.id, drug.name, drug.strength, drug.reorderThreshold)
      .orderBy(user.email, drug.name);
  }

  // Regional stock for every catalog drug (zero for drugs with no entries), optionally as of a cutoff.
  async regionalStock(cutoff?: Date, executor: DbOrTx = db) {
    const join = cutoff
      ? and(eq(regionalDrugStockLedgerEntry.drugId, drug.id), lt(regionalDrugStockLedgerEntry.createdAt, cutoff))
      : eq(regionalDrugStockLedgerEntry.drugId, drug.id);
    return executor
      .select({
        drugId: drug.id, drugName: drug.name, drugStrength: drug.strength,
        reorderThreshold: drug.reorderThreshold, quantity: regionalQty,
        // The latest regional ledger movement for the drug, i.e. when the pool last changed (null if it never has).
        lastActivityAt: max(regionalDrugStockLedgerEntry.createdAt),
      })
      .from(drug)
      .leftJoin(regionalDrugStockLedgerEntry, join)
      .where(eq(drug.isDeleted, false))
      .groupBy(drug.id, drug.name, drug.strength, drug.reorderThreshold)
      .orderBy(drug.name);
  }

  // Regional stock of one drug, as of a cutoff when given.
  async regionalStockForDrug(drugId: string, cutoff?: Date, executor: DbOrTx = db): Promise<number> {
    const filters: SQL[] = [eq(regionalDrugStockLedgerEntry.drugId, drugId)];
    if (cutoff) filters.push(lt(regionalDrugStockLedgerEntry.createdAt, cutoff));
    const rows = await executor.select({ quantity: regionalQty }).from(regionalDrugStockLedgerEntry).where(and(...filters));
    return rows[0]?.quantity ?? 0;
  }

  // One officer's stock of one drug, as of a cutoff when given.
  async officerStockForDrug(officerId: string, drugId: string, cutoff?: Date, executor: DbOrTx = db): Promise<number> {
    const filters: SQL[] = [eq(drugStockLedgerEntry.nursingOfficerId, officerId), eq(drugStockLedgerEntry.drugId, drugId)];
    if (cutoff) filters.push(lt(drugStockLedgerEntry.createdAt, cutoff));
    const rows = await executor.select({ quantity: officerQty }).from(drugStockLedgerEntry).where(and(...filters));
    return rows[0]?.quantity ?? 0;
  }

  // The facility a case's patient belongs to, for reviewer scoping.
  async findCaseFacilityId(nursingCaseId: string): Promise<string | null> {
    const rows = await db.execute<{ facility_id: string }>(sql`
      SELECT p.facility_id FROM nursing_case c JOIN patient p ON p.id = c.patient_id WHERE c.id = ${nursingCaseId} LIMIT 1`);
    return rows[0]?.facility_id ?? null;
  }

  // Finds a drug that hasn't been soft-deleted.
  async findDrug(drugId: string, executor: DbOrTx = db) {
    const rows = await executor.select().from(drug).where(and(eq(drug.id, drugId), eq(drug.isDeleted, false))).limit(1);
    return rows[0] ?? null;
  }

  // Finds a non-deleted request by id.
  async findRequest(id: string, executor: DbOrTx = db) {
    const rows = await executor
      .select().from(drugRequest).where(and(eq(drugRequest.id, id), eq(drugRequest.isDeleted, false))).limit(1);
    return rows[0] ?? null;
  }

  // Requests filtered by requester, facilities and status, newest first, with requester and facility labels.
  async findRequests(filters: { requestedBy?: string; facilityIds?: string[] | null; status?: string }) {
    if (filters.facilityIds && filters.facilityIds.length === 0) return [];
    const where: SQL[] = [eq(drugRequest.isDeleted, false)];
    if (filters.requestedBy) where.push(eq(drugRequest.requestedBy, filters.requestedBy));
    if (filters.facilityIds) where.push(inArray(drugRequest.facilityId, filters.facilityIds));
    if (filters.status) where.push(sql`${drugRequest.status} = ${filters.status}`);
    return db
      .select({
        id: drugRequest.id, status: drugRequest.status, requestedAt: drugRequest.requestedAt,
        facilityId: drugRequest.facilityId, facilityName: facility.name,
        requestedBy: drugRequest.requestedBy, requesterEmail: user.email,
      })
      .from(drugRequest)
      .innerJoin(user, eq(drugRequest.requestedBy, user.id))
      .innerJoin(facility, eq(drugRequest.facilityId, facility.id))
      .where(and(...where))
      .orderBy(desc(drugRequest.requestedAt))
      .limit(100);
  }

  // Lines of the given requests with drug labels.
  async findRequestLines(requestIds: string[]) {
    if (requestIds.length === 0) return [];
    return db
      .select({
        drugRequestId: drugRequestLine.drugRequestId, drugId: drug.id, drugName: drug.name,
        drugStrength: drug.strength, quantityRequested: drugRequestLine.quantityRequested,
      })
      .from(drugRequestLine)
      .innerJoin(drug, eq(drugRequestLine.drugId, drug.id))
      .where(inArray(drugRequestLine.drugRequestId, requestIds));
  }

  // Dispatches for the given requests.
  async findDispatches(requestIds: string[]) {
    if (requestIds.length === 0) return [];
    return db
      .select().from(drugDispatch)
      .where(and(inArray(drugDispatch.drugRequestId, requestIds), eq(drugDispatch.isDeleted, false)));
  }

  // Lines of the given dispatches with drug labels.
  async findDispatchLines(dispatchIds: string[]) {
    if (dispatchIds.length === 0) return [];
    return db
      .select({
        drugDispatchId: drugDispatchLine.drugDispatchId, drugId: drug.id, drugName: drug.name,
        drugStrength: drug.strength, quantityDispatched: drugDispatchLine.quantityDispatched,
      })
      .from(drugDispatchLine)
      .innerJoin(drug, eq(drugDispatchLine.drugId, drug.id))
      .where(inArray(drugDispatchLine.drugDispatchId, dispatchIds));
  }

  // Finds a non-deleted dispatch by id.
  async findDispatch(id: string, executor: DbOrTx = db) {
    const rows = await executor
      .select().from(drugDispatch).where(and(eq(drugDispatch.id, id), eq(drugDispatch.isDeleted, false))).limit(1);
    return rows[0] ?? null;
  }

  // Lines of one dispatch, used to credit the officer's ledger on acknowledgment.
  async findDispatchLinesRaw(dispatchId: string, executor: DbOrTx = db) {
    return executor.select().from(drugDispatchLine).where(eq(drugDispatchLine.drugDispatchId, dispatchId));
  }

  // Lines of one request, used to validate a dispatch against what was asked for.
  async findRequestLinesRaw(requestId: string, executor: DbOrTx = db) {
    return executor.select().from(drugRequestLine).where(eq(drugRequestLine.drugRequestId, requestId));
  }

  // Usage rows for a nursing case with drug labels.
  async findUsageByCase(nursingCaseId: string) {
    return db
      .select({
        id: drugUsage.id, nursingCaseId: drugUsage.nursingCaseId, drugId: drug.id, drugName: drug.name,
        drugStrength: drug.strength, quantityUsed: drugUsage.quantityUsed, usedAt: drugUsage.usedAt,
      })
      .from(drugUsage)
      .innerJoin(drug, eq(drugUsage.drugId, drug.id))
      .where(and(eq(drugUsage.nursingCaseId, nursingCaseId), eq(drugUsage.isDeleted, false)))
      .orderBy(desc(drugUsage.usedAt));
  }

  // Every drug administered to a patient across their cases, newest first (read-only, for the VMO's Medication Triage).
  async findUsageByPatient(patientId: string, limit: number) {
    return db
      .select({
        id: drugUsage.id, nursingCaseId: drugUsage.nursingCaseId, drugName: drug.name,
        drugStrength: drug.strength, quantityUsed: drugUsage.quantityUsed, usedAt: drugUsage.usedAt,
      })
      .from(drugUsage)
      .innerJoin(drug, eq(drugUsage.drugId, drug.id))
      .innerJoin(nursingCase, eq(drugUsage.nursingCaseId, nursingCase.id))
      .where(and(eq(nursingCase.patientId, patientId), eq(drugUsage.isDeleted, false)))
      .orderBy(desc(drugUsage.usedAt))
      .limit(limit);
  }

  // Finds a nursing case by id.
  async findNursingCase(id: string, executor: DbOrTx = db) {
    const rows = await executor
      .select().from(nursingCase).where(and(eq(nursingCase.id, id), isNull(nursingCase.deletedAt))).limit(1);
    return rows[0] ?? null;
  }

  // Loss reports from officers in the given facilities (null means all) since a cutoff, newest first.
  async findLossReports(facilityIds: string[] | null, since?: Date, officerId?: string) {
    if (facilityIds && facilityIds.length === 0) return [];
    const where: SQL[] = [eq(drugLossReport.isDeleted, false)];
    if (facilityIds) where.push(inArray(user.facilityId, facilityIds));
    if (since) where.push(gte(drugLossReport.reportedAt, since));
    if (officerId) where.push(eq(drugLossReport.nursingOfficerId, officerId));
    return db
      .select({
        id: drugLossReport.id, officerId: user.id, officerEmail: user.email, drugId: drug.id, drugName: drug.name,
        drugStrength: drug.strength, quantityLost: drugLossReport.quantityLost, incidentType: drugLossReport.reason,
        reason: drugLossReport.notes, photoFileId: drugLossReport.photoFileId, reportedAt: drugLossReport.reportedAt,
        officerFacilityId: user.facilityId,
      })
      .from(drugLossReport)
      .innerJoin(user, eq(drugLossReport.nursingOfficerId, user.id))
      .innerJoin(drug, eq(drugLossReport.drugId, drug.id))
      .where(and(...where))
      .orderBy(desc(drugLossReport.reportedAt))
      .limit(100);
  }

  // One loss report with its officer's facility, for the photo route's scope check.
  async findLossReportById(id: string) {
    const rows = await db
      .select({ id: drugLossReport.id, photoFileId: drugLossReport.photoFileId, officerFacilityId: user.facilityId })
      .from(drugLossReport).innerJoin(user, eq(drugLossReport.nursingOfficerId, user.id))
      .where(and(eq(drugLossReport.id, id), eq(drugLossReport.isDeleted, false))).limit(1);
    return rows[0] ?? null;
  }

  // Reconciliations for officers in the given facilities (null means all) plus regional ones; optionally only unresolved variances.
  async findReconciliations(facilityIds: string[] | null, onlyOpenVariances: boolean) {
    if (facilityIds && facilityIds.length === 0) return [];
    const where: SQL[] = [];
    if (facilityIds) {
      where.push(sql`(${drugStockReconciliation.scope} = 'REGIONAL' or ${user.facilityId} in ${facilityIds})`);
    }
    if (onlyOpenVariances) where.push(and(ne(drugStockReconciliation.variance, 0), isNull(drugStockReconciliation.resolvedAt))!);
    return db
      .select({
        id: drugStockReconciliation.id, scope: drugStockReconciliation.scope,
        nursingOfficerId: drugStockReconciliation.nursingOfficerId, officerEmail: user.email,
        drugId: drug.id, drugName: drug.name, drugStrength: drug.strength,
        periodStart: drugStockReconciliation.periodStart, periodEnd: drugStockReconciliation.periodEnd,
        expectedQuantity: drugStockReconciliation.expectedQuantity, countedQuantity: drugStockReconciliation.countedQuantity,
        variance: drugStockReconciliation.variance, countedAt: drugStockReconciliation.countedAt,
        resolvedAt: drugStockReconciliation.resolvedAt,
      })
      .from(drugStockReconciliation)
      .innerJoin(drug, eq(drugStockReconciliation.drugId, drug.id))
      .leftJoin(user, eq(drugStockReconciliation.nursingOfficerId, user.id))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(drugStockReconciliation.countedAt))
      .limit(100);
  }

  // Finds a reconciliation by id.
  async findReconciliation(id: string) {
    const rows = await db.select().from(drugStockReconciliation).where(eq(drugStockReconciliation.id, id)).limit(1);
    return rows[0] ?? null;
  }

  // Marks a variance resolved by the given user.
  async resolveReconciliation(id: string, resolvedBy: string) {
    const rows = await db
      .update(drugStockReconciliation)
      .set({ resolvedBy, resolvedAt: new Date() })
      .where(eq(drugStockReconciliation.id, id))
      .returning();
    return rows[0] ?? null;
  }

  // Finds a user (an officer) by id.
  async findUser(id: string) {
    const rows = await db.select().from(user).where(eq(user.id, id)).limit(1);
    return rows[0] ?? null;
  }

  // Locks the given drug rows for the rest of the transaction, serializing concurrent dispatches per drug.
  async lockDrugs(drugIds: string[], executor: DbOrTx) {
    if (drugIds.length === 0) return;
    const ordered = [...drugIds].sort();
    await executor.execute(sql`select id from ${drug} where ${inArray(drug.id, ordered)} order by id for update`);
  }
}
