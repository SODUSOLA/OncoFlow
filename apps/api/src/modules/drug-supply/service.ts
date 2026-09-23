import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { DrugSupplyRepository } from "./repository.js";
import { endOfLagosDay, lagosToday } from "./dates.js";
import {
  drugRequest, drugRequestLine, drugDispatch, drugDispatchLine, drugStockLedgerEntry,
  regionalDrugStockLedgerEntry, drugUsage, drugLossReport, drugStockReconciliation,
} from "./schema.js";

const repo = new DrugSupplyRepository();

// Days of loss reports that still count as a live alert for Regional Admin.
const LOSS_ALERT_DAYS = 7;

// Builds a 400 error with a plain message.
function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, "BAD_REQUEST", message, details);
}

interface Line { drugId: string; quantity: number }

// Rejects empty input and repeated drugs, returning the lines unchanged.
function assertDistinctLines(lines: Line[]): Line[] {
  if (lines.length === 0) throw badRequest("At least one drug line is required");
  if (new Set(lines.map((l) => l.drugId)).size !== lines.length) throw badRequest("Each drug may appear only once");
  return lines;
}

// Business logic for drug requests, dispatch, stock ledgers, usage, loss and reconciliation.
export class DrugSupplyService {
  // Creates a REQUESTED drug request for the officer's facility with its lines.
  async createRequest(officerId: string, facilityId: string | null, lines: Line[]) {
    if (!facilityId) throw badRequest("Your account has no facility, so a drug request can't be routed");
    assertDistinctLines(lines);
    for (const line of lines) {
      if (!(await repo.findDrug(line.drugId))) throw new NotFoundError("Drug not found");
    }
    return db.transaction(async (tx) => {
      const requestId = crypto.randomUUID();
      await tx.insert(drugRequest).values({ id: requestId, requestedBy: officerId, facilityId });
      await tx.insert(drugRequestLine).values(
        lines.map((l) => ({ id: crypto.randomUUID(), drugRequestId: requestId, drugId: l.drugId, quantityRequested: l.quantity })),
      );
      return requestId;
    });
  }

  // Cancels the officer's own request while it is still REQUESTED.
  async cancelRequest(requestId: string, officerId: string) {
    const request = await repo.findRequest(requestId);
    if (!request) throw new NotFoundError("Drug request not found");
    if (request.requestedBy !== officerId) throw new ForbiddenError("You can only cancel your own requests");
    const rows = await db
      .update(drugRequest)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(and(eq(drugRequest.id, requestId), eq(drugRequest.status, "REQUESTED")))
      .returning({ id: drugRequest.id });
    if (rows.length === 0) throw new ConflictError("Only a request that hasn't been dispatched can be cancelled");
  }

  // Lists requests (with lines and any dispatch) filtered by requester, facility scope and status.
  async listRequests(filters: { requestedBy?: string; facilityIds?: string[] | null; status?: string }) {
    const requests = await repo.findRequests(filters);
    const ids = requests.map((r) => r.id);
    const [lines, dispatches] = await Promise.all([repo.findRequestLines(ids), repo.findDispatches(ids)]);
    const dispatchLines = await repo.findDispatchLines(dispatches.map((d) => d.id));
    return requests.map((r) => {
      const dispatch = dispatches.find((d) => d.drugRequestId === r.id) ?? null;
      return {
        ...r,
        lines: lines.filter((l) => l.drugRequestId === r.id),
        dispatch: dispatch
          ? { ...dispatch, lines: dispatchLines.filter((l) => l.drugDispatchId === dispatch.id) }
          : null,
      };
    });
  }

  // Returns a request the caller may see, for scope checks in the controller.
  async getRequest(requestId: string) {
    const request = await repo.findRequest(requestId);
    if (!request) throw new NotFoundError("Drug request not found");
    return request;
  }

  // Dispatches (possibly partially) a request from regional stock, debiting the regional ledger in the same transaction.
  async dispatch(requestId: string, dispatchedBy: string, lines: Line[]) {
    assertDistinctLines(lines);
    return db.transaction(async (tx) => {
      const request = await repo.findRequest(requestId, tx);
      if (!request) throw new NotFoundError("Drug request not found");
      const requested = await repo.findRequestLinesRaw(requestId, tx);
      for (const line of lines) {
        const asked = requested.find((r) => r.drugId === line.drugId);
        if (!asked) throw badRequest("A dispatched drug wasn't part of the request");
        if (line.quantity > asked.quantityRequested) throw badRequest("A dispatched quantity exceeds what was requested");
      }
      // The lock serializes dispatches per drug, so two admins can't both spend the same regional stock.
      await repo.lockDrugs(lines.map((l) => l.drugId), tx);
      for (const line of lines) {
        const available = await repo.regionalStockForDrug(line.drugId, undefined, tx);
        if (line.quantity > available) {
          const drugRow = await repo.findDrug(line.drugId, tx);
          throw new ConflictError(
            `Only ${available} of ${drugRow?.name ?? "this drug"} is available in regional stock`,
            { drugId: line.drugId, available },
          );
        }
      }
      // The status guard makes a second concurrent dispatch of the same request a conflict rather than a double debit.
      const moved = await tx
        .update(drugRequest)
        .set({ status: "DISPATCHED", updatedAt: new Date() })
        .where(and(eq(drugRequest.id, requestId), eq(drugRequest.status, "REQUESTED")))
        .returning({ id: drugRequest.id });
      if (moved.length === 0) throw new ConflictError("This request has already been dispatched or cancelled");

      const dispatchId = crypto.randomUUID();
      await tx.insert(drugDispatch).values({ id: dispatchId, drugRequestId: requestId, dispatchedBy });
      await tx.insert(drugDispatchLine).values(
        lines.map((l) => ({ id: crypto.randomUUID(), drugDispatchId: dispatchId, drugId: l.drugId, quantityDispatched: l.quantity })),
      );
      await tx.insert(regionalDrugStockLedgerEntry).values(
        lines.map((l) => ({ drugId: l.drugId, quantityDelta: -l.quantity, reason: "DISPATCH" as const, referenceId: dispatchId })),
      );
      return dispatchId;
    });
  }

  // Officer acknowledges receipt: flips the dispatch to DELIVERED and credits their ledger atomically.
  async acknowledge(dispatchId: string, officerId: string) {
    return db.transaction(async (tx) => {
      const dispatch = await repo.findDispatch(dispatchId, tx);
      if (!dispatch) throw new NotFoundError("Dispatch not found");
      const request = await repo.findRequest(dispatch.drugRequestId, tx);
      if (!request || request.requestedBy !== officerId) throw new ForbiddenError("This dispatch isn't addressed to you");

      // The IN_TRANSIT guard makes a repeated or concurrent acknowledgment a conflict, so stock is never credited twice.
      const moved = await tx
        .update(drugDispatch)
        .set({ status: "DELIVERED", acknowledgedBy: officerId, acknowledgedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(drugDispatch.id, dispatchId), eq(drugDispatch.status, "IN_TRANSIT")))
        .returning({ id: drugDispatch.id });
      if (moved.length === 0) throw new ConflictError("This dispatch has already been acknowledged");

      const lines = await repo.findDispatchLinesRaw(dispatchId, tx);
      await tx.insert(drugStockLedgerEntry).values(
        lines.map((l) => ({
          nursingOfficerId: officerId, drugId: l.drugId, quantityDelta: l.quantityDispatched,
          reason: "DELIVERY" as const, referenceId: dispatchId,
        })),
      );
      await tx.update(drugRequest).set({ status: "DELIVERED", updatedAt: new Date() }).where(eq(drugRequest.id, request.id));
    });
  }

  // Records a drug administered against the officer's own open case and debits their ledger in the same transaction.
  async recordUsage(officerId: string, nursingCaseId: string, drugId: string, quantity: number) {
    const nursingCaseRow = await repo.findNursingCase(nursingCaseId);
    if (!nursingCaseRow) throw new NotFoundError("Nursing case not found");
    if (nursingCaseRow.startedBy !== officerId) throw new ForbiddenError("You can only log usage against your own case");
    if (nursingCaseRow.status === "CLOSED") throw new ConflictError("This case is closed");
    if (!(await repo.findDrug(drugId))) throw new NotFoundError("Drug not found");
    return db.transaction(async (tx) => {
      const usageId = crypto.randomUUID();
      await tx.insert(drugUsage).values({ id: usageId, nursingCaseId, drugId, administeredBy: officerId, quantityUsed: quantity });
      // Recorded even if it drives stock negative: the drug was administered, and reconciliation is what surfaces the gap.
      await tx.insert(drugStockLedgerEntry).values({
        nursingOfficerId: officerId, drugId, quantityDelta: -quantity, reason: "USAGE", referenceId: usageId,
      });
      return usageId;
    });
  }

  // Lists usage logged against a case the caller started.
  async listUsage(nursingCaseId: string, callerId: string) {
    const nursingCaseRow = await repo.findNursingCase(nursingCaseId);
    if (!nursingCaseRow) throw new NotFoundError("Nursing case not found");
    if (nursingCaseRow.startedBy !== callerId) throw new ForbiddenError("Forbidden");
    return repo.findUsageByCase(nursingCaseId);
  }

  // Records spillage or breakage outside any case, debiting the officer's ledger atomically.
  async reportLoss(officerId: string, drugId: string, quantity: number, reason: "SPILLAGE" | "BREAKAGE" | "OTHER", notes?: string) {
    if (!(await repo.findDrug(drugId))) throw new NotFoundError("Drug not found");
    if (reason === "OTHER" && !notes?.trim()) throw badRequest("Please describe what happened");
    return db.transaction(async (tx) => {
      const reportId = crypto.randomUUID();
      await tx.insert(drugLossReport).values({
        id: reportId, nursingOfficerId: officerId, drugId, quantityLost: quantity, reason, notes: notes?.trim() || null,
      });
      await tx.insert(drugStockLedgerEntry).values({
        nursingOfficerId: officerId, drugId, quantityDelta: -quantity, reason: "LOSS", referenceId: reportId,
      });
      return reportId;
    });
  }

  // The officer's stock per drug with a low-stock flag against each drug's reorder threshold.
  async myStock(officerId: string) {
    const rows = await repo.officerStock(officerId);
    return rows.map((r) => ({ ...r, lowStock: r.reorderThreshold !== null && r.quantity <= r.reorderThreshold }));
  }

  // Regional stock per drug with a low-stock flag.
  async regionalStock() {
    const rows = await repo.regionalStock();
    return rows.map((r) => ({ ...r, lowStock: r.reorderThreshold !== null && r.quantity <= r.reorderThreshold }));
  }

  // Each officer's stock as of the end of a Lagos day (today when omitted), for the per-day view.
  async officersStock(facilityIds: string[] | null, asOf?: string) {
    const date = asOf ?? lagosToday();
    const rows = await repo.officersStock(facilityIds, asOf ? endOfLagosDay(asOf) : undefined);
    return { asOf: date, stock: rows.map((r) => ({ ...r, lowStock: r.reorderThreshold !== null && r.quantity <= r.reorderThreshold })) };
  }

  // Loss reports from officers in scope.
  async listLosses(facilityIds: string[] | null) {
    return repo.findLossReports(facilityIds);
  }

  // Records a physical count against the ledger, snapshotting the expected quantity as of the period end.
  async recordReconciliation(data: {
    scope: "REGIONAL" | "NURSING_OFFICER"; nursingOfficerId?: string; drugId: string;
    periodStart: string; periodEnd: string; countedQuantity: number; countedBy: string;
  }) {
    if (data.periodStart > data.periodEnd) throw badRequest("The period can't end before it starts");
    if (data.scope === "NURSING_OFFICER" && !data.nursingOfficerId) throw badRequest("An officer is required for a nursing officer count");
    if (data.scope === "REGIONAL" && data.nursingOfficerId) throw badRequest("A regional count has no officer");
    if (!(await repo.findDrug(data.drugId))) throw new NotFoundError("Drug not found");
    const cutoff = endOfLagosDay(data.periodEnd);
    const expected = data.scope === "REGIONAL"
      ? await repo.regionalStockForDrug(data.drugId, cutoff)
      : await repo.officerStockForDrug(data.nursingOfficerId!, data.drugId, cutoff);
    const id = crypto.randomUUID();
    await db.insert(drugStockReconciliation).values({
      id, scope: data.scope, nursingOfficerId: data.nursingOfficerId ?? null, drugId: data.drugId,
      periodStart: data.periodStart, periodEnd: data.periodEnd, expectedQuantity: expected,
      countedQuantity: data.countedQuantity, variance: data.countedQuantity - expected, countedBy: data.countedBy,
    });
    return { id, expectedQuantity: expected, countedQuantity: data.countedQuantity, variance: data.countedQuantity - expected };
  }

  // Lists reconciliations in scope, optionally only unresolved variances.
  async listReconciliations(facilityIds: string[] | null, onlyOpenVariances: boolean) {
    return repo.findReconciliations(facilityIds, onlyOpenVariances);
  }

  // Resolves a reconciliation variance.
  async resolveReconciliation(id: string, resolvedBy: string) {
    const existing = await repo.findReconciliation(id);
    if (!existing) throw new NotFoundError("Reconciliation not found");
    return repo.resolveReconciliation(id, resolvedBy);
  }

  // One computation over every alert source (low stock, losses, open variances), so a new source only adds a branch here.
  async alerts(facilityIds: string[] | null) {
    const since = new Date(Date.now() - LOSS_ALERT_DAYS * 24 * 60 * 60 * 1000);
    const [regional, officers, losses, variances] = await Promise.all([
      repo.regionalStock(),
      repo.officersStock(facilityIds),
      repo.findLossReports(facilityIds, since),
      repo.findReconciliations(facilityIds, true),
    ]);
    const isLow = (q: number, t: number | null) => t !== null && q <= t;
    return {
      lowStock: [
        ...regional.filter((r) => isLow(r.quantity, r.reorderThreshold)).map((r) => ({ scope: "REGIONAL" as const, ...r })),
        ...officers.filter((r) => isLow(r.quantity, r.reorderThreshold)).map((r) => ({ scope: "NURSING_OFFICER" as const, ...r })),
      ],
      losses,
      variances,
    };
  }
}

export const drugSupplyService = new DrugSupplyService();
