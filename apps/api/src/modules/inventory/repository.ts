import { eq, and, inArray, isNull, ne } from "drizzle-orm";
import { db } from "../../db/index.js";
import { drug, inventory, inventoryMovement, reconciliationRecord } from "./schema.js";

// Data access for drugs, stock, movements and reconciliation.
export class InventoryRepository {
  // Lists all non-deleted drugs.
  async findAllDrugs() {
    return db.select().from(drug).where(eq(drug.isDeleted, false));
  }

  // Facility-level stock rows only; the regional pool now lives in the regional ledger.
  async findStockByFacilityIds(facilityIds: string[]) {
    if (facilityIds.length === 0) return [];
    return db
      .select({
        id: inventory.id,
        facilityId: inventory.facilityId,
        quantity: inventory.quantity,
        drugId: drug.id,
        drugName: drug.name,
        drugStrength: drug.strength,
        reorderThreshold: drug.reorderThreshold,
      })
      .from(inventory)
      .innerJoin(drug, eq(inventory.drugId, drug.id))
      .where(inArray(inventory.facilityId, facilityIds));
  }

  // Finds the stock row for a facility (or the regional pool) and drug.
  async findInventoryRow(facilityId: string | null, drugId: string) {
    const rows = await db
      .select()
      .from(inventory)
      .where(and(facilityId ? eq(inventory.facilityId, facilityId) : isNull(inventory.facilityId), eq(inventory.drugId, drugId)))
      .limit(1);
    return rows[0] ?? null;
  }

  // Adjusts a stock quantity by a delta, creating the row if missing.
  async upsertQuantity(facilityId: string | null, drugId: string, delta: number) {
    const existing = await this.findInventoryRow(facilityId, drugId);
    if (existing) {
      const updated = await db
        .update(inventory)
        .set({ quantity: existing.quantity + delta, updatedAt: new Date() })
        .where(eq(inventory.id, existing.id))
        .returning();
      return updated[0]!;
    }
    const created = await db
      .insert(inventory)
      .values({ facilityId, drugId, quantity: Math.max(delta, 0) })
      .returning();
    return created[0]!;
  }

  // Inserts a stock movement.
  async insertMovement(data: typeof inventoryMovement.$inferInsert) {
    const row = await db.insert(inventoryMovement).values(data).returning();
    return row[0]!;
  }

  // Reconciliation has no per-drug reference, so variances are surfaced per facility rather than per item.
  async findOpenVariances(facilityIds: string[]) {
    if (facilityIds.length === 0) return [];
    return db
      .select()
      .from(reconciliationRecord)
      .where(and(inArray(reconciliationRecord.facilityId, facilityIds), ne(reconciliationRecord.status, "RESOLVED")));
  }

  // Marks a variance resolved by the given user.
  async resolveVariance(id: string, resolvedBy: string) {
    const rows = await db
      .update(reconciliationRecord)
      .set({ status: "RESOLVED", resolvedBy, resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(reconciliationRecord.id, id))
      .returning();
    return rows[0] ?? null;
  }
}
