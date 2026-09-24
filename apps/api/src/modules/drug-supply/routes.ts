import { Router } from "express";
import { z } from "zod";
import {
  createRequestHandler, listMyRequestsHandler, listRequestsHandler, cancelRequestHandler, dispatchHandler,
  acknowledgeHandler, myStockHandler, regionalStockHandler, officersStockHandler, recordUsageHandler,
  listUsageHandler, reportLossHandler, listLossesHandler, createReconciliationHandler,
  listReconciliationsHandler, resolveReconciliationHandler, alertsHandler,
} from "./controller.js";
import { requireAuthenticated, requirePermission } from "../../lib/rbac.js";
import { validateBody, validateParams, validateQuery } from "../../lib/validation.js";
import { drugLossReasonEnum, drugReconciliationScopeEnum, drugRequestStatusEnum } from "../../db/enums.js";

const quantity = z.number().int().positive().max(100_000);
const lineSchema = z.object({ drugId: z.string().uuid(), quantity });
const linesBody = z.object({ lines: z.array(lineSchema).min(1).max(50) });
const idParam = z.object({ id: z.string().uuid() });
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listRequestsQuery = z.object({ status: z.enum(drugRequestStatusEnum.enumValues).optional() });
const officersStockQuery = z.object({ asOf: dateString.optional() });
const usageBody = z.object({ nursingCaseId: z.string().uuid(), drugId: z.string().uuid(), quantity });
const usageQuery = z.object({ nursingCaseId: z.string().uuid() });
const lossBody = z.object({
  drugId: z.string().uuid(), quantity,
  reason: z.enum(drugLossReasonEnum.enumValues), notes: z.string().trim().max(1000).optional(),
});
const reconciliationBody = z.object({
  scope: z.enum(drugReconciliationScopeEnum.enumValues),
  nursingOfficerId: z.string().uuid().optional(),
  drugId: z.string().uuid(),
  periodStart: dateString, periodEnd: dateString,
  countedQuantity: z.number().int().min(0).max(1_000_000),
});
const listReconciliationsQuery = z.object({ open: z.enum(["true", "false"]).optional() });

const router = Router();

// An officer requests drugs from Regional Admin.
router.post("/drug-requests", requirePermission("drugRequest", "create"), validateBody(linesBody), createRequestHandler);
// The caller's own requests and their dispatch status; must precede /drug-requests/:id routes.
router.get("/drug-requests/mine", requirePermission("drugRequest", "create"), listMyRequestsHandler);
// Regional Admin's queue of requests from their region.
router.get("/drug-requests", requirePermission("drugRequest", "read"), validateQuery(listRequestsQuery), listRequestsHandler);
// An officer cancels their own request before it is dispatched.
router.post("/drug-requests/:id/cancel", requirePermission("drugRequest", "create"), validateParams(idParam), cancelRequestHandler);
// Regional Admin dispatches (possibly partially) from regional stock.
router.post(
  "/drug-requests/:id/dispatch",
  requirePermission("drugDispatch", "create"), validateParams(idParam), validateBody(linesBody), dispatchHandler,
);
// The requesting officer acknowledges receipt, crediting their stock.
router.post("/drug-dispatches/:id/acknowledge", requirePermission("drugDispatch", "update"), validateParams(idParam), acknowledgeHandler);

// The caller's own stock per drug.
router.get("/drug-stock/mine", requirePermission("drugStock", "read"), myStockHandler);
// Regional stock per drug.
router.get("/drug-stock/regional", requirePermission("drugAlert", "read"), regionalStockHandler);
// Each officer's stock as of a day.
router.get("/drug-stock/officers", requirePermission("drugAlert", "read"), validateQuery(officersStockQuery), officersStockHandler);

// Logs a drug used against the caller's case.
router.post("/drug-usage", requirePermission("drugUsage", "create"), validateBody(usageBody), recordUsageHandler);
// Lists usage logged against a case — the nurse who owns it, or QA reviewing it; checked in the service.
router.get("/drug-usage", requireAuthenticated(), validateQuery(usageQuery), listUsageHandler);

// Reports spillage or breakage.
router.post("/drug-loss-reports", requirePermission("drugLoss", "create"), validateBody(lossBody), reportLossHandler);
// Loss reports from the admin's region.
router.get("/drug-loss-reports", requirePermission("drugLoss", "read"), listLossesHandler);

// Records a physical count against the ledger.
router.post("/drug-reconciliations", requirePermission("drugReconciliation", "create"), validateBody(reconciliationBody), createReconciliationHandler);
// Lists reconciliations, optionally only unresolved variances.
router.get(
  "/drug-reconciliations",
  requirePermission("drugReconciliation", "read"), validateQuery(listReconciliationsQuery), listReconciliationsHandler,
);
// Resolves a variance.
router.post(
  "/drug-reconciliations/:id/resolve",
  requirePermission("drugReconciliation", "update"), validateParams(idParam), resolveReconciliationHandler,
);

// Low-stock, loss and variance alerts feeding the shared alert aggregator.
router.get("/drug-alerts", requirePermission("drugAlert", "read"), alertsHandler);

export { router as drugSupplyRoutes };
