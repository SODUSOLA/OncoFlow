import type { Request, Response } from "express";
import { userHasPermission, type AuthenticatedRequest } from "../../lib/rbac.js";
import { accessibleFacilityIds } from "../../lib/facility-scope.js";
import { AppError } from "../../lib/errors.js";
import { drugSupplyService } from "./service.js";

// Maps an error to its HTTP status, defaulting to 500.
function errorStatus(err: unknown): number {
  return err instanceof AppError ? err.statusCode : 500;
}
// Builds the error body, keeping structured details such as the available regional quantity.
function errorBody(err: unknown) {
  if (err instanceof AppError) return { error: err.message, ...(err.details !== undefined ? { details: err.details } : {}) };
  return { error: "Internal server error" };
}
// Sends an error response for any thrown error.
function fail(res: Response, err: unknown) {
  res.status(errorStatus(err)).json(errorBody(err));
}
// Returns the authenticated caller's id.
function callerId(req: Request): string {
  return (req as AuthenticatedRequest).userId;
}

// Creates a drug request for the officer's own facility.
export async function createRequestHandler(req: Request, res: Response) {
  try {
    const id = await drugSupplyService.createRequest(callerId(req), (req as AuthenticatedRequest).facilityId ?? null, req.body.lines);
    res.status(201).json({ id });
  } catch (err) { fail(res, err); }
}

// Lists the caller's own requests, with any dispatch attached.
export async function listMyRequestsHandler(req: Request, res: Response) {
  try {
    res.json({ requests: await drugSupplyService.listRequests({ requestedBy: callerId(req) }) });
  } catch (err) { fail(res, err); }
}

// Lists requests from facilities in the admin's region, optionally by status.
export async function listRequestsHandler(req: Request, res: Response) {
  try {
    const facilityIds = await accessibleFacilityIds(callerId(req));
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json({ requests: await drugSupplyService.listRequests({ facilityIds, status }) });
  } catch (err) { fail(res, err); }
}

// Cancels the caller's own undispatched request.
export async function cancelRequestHandler(req: Request, res: Response) {
  try {
    await drugSupplyService.cancelRequest(String(req.params.id), callerId(req));
    res.status(204).end();
  } catch (err) { fail(res, err); }
}

// Dispatches a request from regional stock, refusing requests outside the admin's region.
export async function dispatchHandler(req: Request, res: Response) {
  try {
    const request = await drugSupplyService.getRequest(String(req.params.id));
    const facilityIds = await accessibleFacilityIds(callerId(req));
    if (facilityIds && !facilityIds.includes(request.facilityId)) {
      res.status(403).json({ error: "This request is outside your region" });
      return;
    }
    const id = await drugSupplyService.dispatch(request.id, callerId(req), req.body.lines);
    res.status(201).json({ id });
  } catch (err) { fail(res, err); }
}

// The requesting officer confirms physical receipt of a dispatch.
export async function acknowledgeHandler(req: Request, res: Response) {
  try {
    await drugSupplyService.acknowledge(String(req.params.id), callerId(req));
    res.status(204).end();
  } catch (err) { fail(res, err); }
}

// Returns the caller's own stock per drug.
export async function myStockHandler(req: Request, res: Response) {
  try {
    res.json({ stock: await drugSupplyService.myStock(callerId(req)) });
  } catch (err) { fail(res, err); }
}

// Returns regional stock per drug.
export async function regionalStockHandler(_req: Request, res: Response) {
  try {
    res.json({ stock: await drugSupplyService.regionalStock() });
  } catch (err) { fail(res, err); }
}

// Returns each in-scope officer's stock as of a day.
export async function officersStockHandler(req: Request, res: Response) {
  try {
    const facilityIds = await accessibleFacilityIds(callerId(req));
    const asOf = typeof req.query.asOf === "string" ? req.query.asOf : undefined;
    res.json(await drugSupplyService.officersStock(facilityIds, asOf));
  } catch (err) { fail(res, err); }
}

// Logs a drug administered against one of the caller's cases.
export async function recordUsageHandler(req: Request, res: Response) {
  try {
    const { nursingCaseId, drugId, quantity } = req.body;
    const id = await drugSupplyService.recordUsage(callerId(req), nursingCaseId, drugId, quantity);
    res.status(201).json({ id });
  } catch (err) { fail(res, err); }
}

// Lists usage logged against one of the caller's cases.
export async function listUsageHandler(req: Request, res: Response) {
  try {
    res.json({ usage: await drugSupplyService.listUsage(String(req.query.nursingCaseId), callerId(req)) });
  } catch (err) { fail(res, err); }
}

// Reports spillage or breakage outside any case.
export async function reportLossHandler(req: Request, res: Response) {
  try {
    const { drugId, quantity, reason, notes } = req.body;
    const id = await drugSupplyService.reportLoss(callerId(req), drugId, quantity, reason, notes);
    res.status(201).json({ id });
  } catch (err) { fail(res, err); }
}

// Lists loss reports from officers in the admin's region.
export async function listLossesHandler(req: Request, res: Response) {
  try {
    res.json({ losses: await drugSupplyService.listLosses(await accessibleFacilityIds(callerId(req))) });
  } catch (err) { fail(res, err); }
}

// Records a physical count; officers may count only their own stock, while admins may count either scope.
export async function createReconciliationHandler(req: Request, res: Response) {
  try {
    const caller = callerId(req);
    const isAdmin = await userHasPermission(caller, "drugReconciliation", "update");
    const body = req.body;
    if (!isAdmin && !(body.scope === "NURSING_OFFICER" && (body.nursingOfficerId ?? caller) === caller)) {
      res.status(403).json({ error: "You can only reconcile your own stock" });
      return;
    }
    const result = await drugSupplyService.recordReconciliation({
      ...body,
      nursingOfficerId: body.scope === "NURSING_OFFICER" ? body.nursingOfficerId ?? caller : undefined,
      countedBy: caller,
    });
    res.status(201).json(result);
  } catch (err) { fail(res, err); }
}

// Lists reconciliations in the admin's scope, optionally only unresolved variances.
export async function listReconciliationsHandler(req: Request, res: Response) {
  try {
    const facilityIds = await accessibleFacilityIds(callerId(req));
    const reconciliations = await drugSupplyService.listReconciliations(facilityIds, req.query.open === "true");
    res.json({ reconciliations });
  } catch (err) { fail(res, err); }
}

// Resolves a reconciliation variance.
export async function resolveReconciliationHandler(req: Request, res: Response) {
  try {
    const record = await drugSupplyService.resolveReconciliation(String(req.params.id), callerId(req));
    res.json({ record });
  } catch (err) { fail(res, err); }
}

// Returns low-stock, loss and open-variance alerts for the admin's region.
export async function alertsHandler(req: Request, res: Response) {
  try {
    res.json(await drugSupplyService.alerts(await accessibleFacilityIds(callerId(req))));
  } catch (err) { fail(res, err); }
}
