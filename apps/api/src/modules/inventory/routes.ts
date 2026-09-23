import { Router } from "express";
import { z } from "zod";
import {
  listDrugsHandler, getInventoryOverviewHandler, recordMovementHandler, resolveVarianceHandler,
} from "./controller.js";
import { requirePermission } from "../../lib/rbac.js";
import { validateBody, validateQuery, validateParams } from "../../lib/validation.js";

const overviewQuerySchema = z.object({
  region: z.string().trim().min(1).optional(),
});

const recordMovementSchema = z.object({
  facilityId: z.string().uuid().nullable().optional(),
  drugId: z.string().uuid(),
  quantity: z.number().int().positive(),
  movementType: z.enum(["PURCHASE", "DISPATCH"]),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const router = Router();

// Lists all drugs.
router.get("/inventory/drugs", requirePermission("inventory", "read"), listDrugsHandler);
// Stock and open variances for the caller's scope.
router.get("/inventory/overview", requirePermission("inventory", "read"), validateQuery(overviewQuerySchema), getInventoryOverviewHandler);
// Records a stock movement.
router.post("/inventory/movements", requirePermission("inventory", "update"), validateBody(recordMovementSchema), recordMovementHandler);
// Resolves a reconciliation variance.
router.post(
  "/inventory/reconciliations/:id/resolve",
  requirePermission("inventory", "update"),
  validateParams(idParamSchema),
  resolveVarianceHandler,
);

export { router as inventoryRoutes };
