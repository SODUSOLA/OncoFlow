import { FacilityRepository } from "../facility/repository.js";
import { InventoryRepository } from "./repository.js";
import { db } from "../../db/index.js";
import { DrugSupplyRepository } from "../drug-supply/repository.js";
import { regionalDrugStockLedgerEntry } from "../drug-supply/schema.js";
import { ConflictError } from "../../lib/errors.js";

const inventoryRepo = new InventoryRepository();
const facilityRepo = new FacilityRepository();
const drugSupplyRepo = new DrugSupplyRepository();

// Business logic for inventory.
export class InventoryService {
  // Lists all drugs.
  async listDrugs() {
    return inventoryRepo.findAllDrugs();
  }

  // Builds the per-facility stock and open variance overview, optionally filtered by region.
  async getOverview(region: string | undefined) {
    const allFacilities = await facilityRepo.findAll();
    const facilities = region ? allFacilities.filter((f) => f.region === region) : allFacilities;
    const facilityIds = facilities.map((f) => f.id);
    const facilityNameById = new Map(facilities.map((f) => [f.id, f.name]));

    const [facilityStock, regionalStock, variances] = await Promise.all([
      inventoryRepo.findStockByFacilityIds(facilityIds),
      drugSupplyRepo.regionalStock(),
      inventoryRepo.findOpenVariances(facilityIds),
    ]);
    // The regional pool is a ledger SUM, presented as a null-facility row so existing consumers keep working.
    const stock = [
      ...facilityStock,
      ...regionalStock.map((r) => ({ drugId: r.drugId, drugName: r.drugName, drugStrength: r.drugStrength, reorderThreshold: r.reorderThreshold, facilityId: null, quantity: r.quantity })),
    ];

    return {
      stock: stock.map((s) => ({
        drugId: s.drugId,
        drugName: s.drugName,
        drugStrength: s.drugStrength,
        reorderThreshold: s.reorderThreshold,
        facilityId: s.facilityId,
        facilityName: s.facilityId ? facilityNameById.get(s.facilityId) ?? "Unknown facility" : "Regional pool",
        quantity: s.quantity,
      })),
      variances: variances.map((v) => ({
        id: v.id,
        facilityId: v.facilityId,
        facilityName: facilityNameById.get(v.facilityId) ?? "Unknown facility",
        weekEnding: v.weekEnding,
        expectedQty: v.expectedQty,
        actualQty: v.actualQty,
        variance: v.variance,
        status: v.status,
      })),
      variancesOpen: variances.length,
      // When the most recent open variance was raised or last touched, so the alert can sort by latest activity.
      latestVarianceAt: variances.length
        ? new Date(Math.max(...variances.map((v) => Math.max(v.createdAt.getTime(), v.updatedAt.getTime())))).toISOString()
        : null,
    };
  }

  // Records a stock movement: regional-pool movements append to the regional ledger, facility ones update the facility counter.
  async recordMovement(data: {
    facilityId: string | null;
    drugId: string;
    quantity: number;
    movementType: "PURCHASE" | "DISPATCH";
    performedBy: string;
  }) {
    if (data.facilityId === null) return this.recordRegionalMovement(data);
    const delta = data.movementType === "PURCHASE" ? data.quantity : -data.quantity;
    const updated = await inventoryRepo.upsertQuantity(data.facilityId, data.drugId, delta);
    await inventoryRepo.insertMovement({
      inventoryId: updated.id,
      movementType: data.movementType,
      quantity: data.quantity,
      performedBy: data.performedBy,
    });
    return updated;
  }

  // Resolves a variance, throwing if it doesn't exist.
  async resolveVariance(id: string, resolvedBy: string) {
    const row = await inventoryRepo.resolveVariance(id, resolvedBy);
    if (!row) throw new Error("Reconciliation record not found");
    return row;
  }

  // Appends a procurement (positive) or manual write-off (negative) entry to the regional ledger, refusing to go below zero.
  private async recordRegionalMovement(data: { drugId: string; quantity: number; movementType: "PURCHASE" | "DISPATCH" }) {
    return db.transaction(async (tx) => {
      await drugSupplyRepo.lockDrugs([data.drugId], tx);
      if (data.movementType === "DISPATCH") {
        const available = await drugSupplyRepo.regionalStockForDrug(data.drugId, undefined, tx);
        if (data.quantity > available) throw new ConflictError(`Only ${available} is available in regional stock`);
      }
      const delta = data.movementType === "PURCHASE" ? data.quantity : -data.quantity;
      await tx
        .insert(regionalDrugStockLedgerEntry)
        .values({ drugId: data.drugId, quantityDelta: delta, reason: data.movementType === "PURCHASE" ? "PROCUREMENT" : "ADJUSTMENT" });
      // Same response shape as a facility movement, with the quantity read back from the ledger.
      return { facilityId: null, drugId: data.drugId, quantity: await drugSupplyRepo.regionalStockForDrug(data.drugId, undefined, tx) };
    });
  }
}
