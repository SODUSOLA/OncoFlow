import { eq, and, inArray, isNull, or, ne } from "drizzle-orm";
import { db } from "../../db/index.js";
import { drug, inventory, inventoryMovement, reconciliationRecord } from "./schema.js";

export class InventoryRepository {
  async findAllDrugs() {
    return db.select().from(drug).where(eq(drug.isDeleted, false));
  }

  // Includes the null-facilityId rows too (the regional pool) alongside any in-region
  // facility's own stock — the regional pool is genuinely region-level, not facility-level,
  // per 15-admin-portal-flow-inventory.md's own framing of Inventory.facilityId IS NULL.
  async findStockByFacilityIds(facilityIds: string[]) {
    return db
      .select({
        id: inventory.id,
        facilityId: inventory.facilityId,
        quantity: inventory.quantity,
        drugId: drug.id,
        drugName: drug.name,
        drugStrength: drug.strength,
      })
      .from(inventory)
      .innerJoin(drug, eq(inventory.drugId, drug.id))
      .where(
        facilityIds.length === 0
          ? isNull(inventory.facilityId)
          : or(inArray(inventory.facilityId, facilityIds), isNull(inventory.facilityId)),
      );
  }

  async findInventoryRow(facilityId: string | null, drugId: string) {
    const rows = await db
      .select()
      .from(inventory)
      .where(and(facilityId ? eq(inventory.facilityId, facilityId) : isNull(inventory.facilityId), eq(inventory.drugId, drugId)))
      .limit(1);
    return rows[0] ?? null;
  }

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

  async insertMovement(data: typeof inventoryMovement.$inferInsert) {
    const row = await db.insert(inventoryMovement).values(data).returning();
    return row[0]!;
  }

  // reconciliation_record has no per-drug reference (facility-level weekly count only) — the
  // frontend surfaces this as one row per facility, not per item, which is what the schema
  // actually supports rather than an invented item column.
  async findOpenVariances(facilityIds: string[]) {
    if (facilityIds.length === 0) return [];
    return db
      .select()
      .from(reconciliationRecord)
      .where(and(inArray(reconciliationRecord.facilityId, facilityIds), ne(reconciliationRecord.status, "RESOLVED")));
  }

  async resolveVariance(id: string, resolvedBy: string) {
    const rows = await db
      .update(reconciliationRecord)
      .set({ status: "RESOLVED", resolvedBy, resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(reconciliationRecord.id, id))
      .returning();
    return rows[0] ?? null;
  }
}
