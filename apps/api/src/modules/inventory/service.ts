import { FacilityRepository } from "../facility/repository.js";
import { InventoryRepository } from "./repository.js";

const inventoryRepo = new InventoryRepository();
const facilityRepo = new FacilityRepository();

export class InventoryService {
  async listDrugs() {
    return inventoryRepo.findAllDrugs();
  }

  async getOverview(region: string | undefined) {
    const allFacilities = await facilityRepo.findAll();
    const facilities = region ? allFacilities.filter((f) => f.region === region) : allFacilities;
    const facilityIds = facilities.map((f) => f.id);
    const facilityNameById = new Map(facilities.map((f) => [f.id, f.name]));

    const [stock, variances] = await Promise.all([
      inventoryRepo.findStockByFacilityIds(facilityIds),
      inventoryRepo.findOpenVariances(facilityIds),
    ]);

    return {
      stock: stock.map((s) => ({
        drugId: s.drugId,
        drugName: s.drugName,
        drugStrength: s.drugStrength,
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
    };
  }

  async recordMovement(data: {
    facilityId: string | null;
    drugId: string;
    quantity: number;
    movementType: "PURCHASE" | "DISPATCH";
    performedBy: string;
  }) {
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

  async resolveVariance(id: string, resolvedBy: string) {
    const row = await inventoryRepo.resolveVariance(id, resolvedBy);
    if (!row) throw new Error("Reconciliation record not found");
    return row;
  }
}
