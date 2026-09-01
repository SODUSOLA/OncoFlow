import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../lib/rbac.js";
import { InventoryService } from "./service.js";

const inventorySvc = new InventoryService();

export async function listDrugsHandler(_req: Request, res: Response) {
  try {
    const drugs = await inventorySvc.listDrugs();
    res.json({ drugs });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getInventoryOverviewHandler(req: Request, res: Response) {
  try {
    const region = typeof req.query.region === "string" ? req.query.region : undefined;
    const overview = await inventorySvc.getOverview(region);
    res.json(overview);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function recordMovementHandler(req: Request, res: Response) {
  try {
    const { facilityId, drugId, quantity, movementType } = req.body;
    const performedBy = (req as AuthenticatedRequest).userId;
    const inventoryRow = await inventorySvc.recordMovement({
      facilityId: facilityId ?? null, drugId, quantity, movementType, performedBy,
    });
    res.status(201).json({ inventory: inventoryRow });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(400).json({ error: message });
  }
}

export async function resolveVarianceHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const resolvedBy = (req as AuthenticatedRequest).userId;
    const record = await inventorySvc.resolveVariance(String(id), resolvedBy);
    res.json({ record });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(message === "Reconciliation record not found" ? 404 : 500).json({ error: message });
  }
}
