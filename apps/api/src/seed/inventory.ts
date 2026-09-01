import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { facility, drug, inventory, reconciliationRecord } from "../db/schema.js";

const DRUGS = [
  { name: "Cyclophosphamide", strength: "500mg", category: "Chemotherapy" },
  { name: "Doxorubicin", strength: "50mg", category: "Chemotherapy" },
  { name: "Ondansetron", strength: "8mg", category: "Antiemetic" },
  { name: "Filgrastim", strength: "300mcg", category: "Supportive Care" },
];

export async function seedInventory() {
  const existingDrugs = await db.select().from(drug).limit(1);
  if (existingDrugs.length > 0) {
    console.log("Inventory drugs already seeded, skipping");
    return;
  }

  const drugRows = await db.insert(drug).values(DRUGS).returning();
  console.log(`Seeded ${drugRows.length} drugs`);

  const facilities = await db.select().from(facility).where(sql`${facility.isDeleted} = false`);
  const luth = facilities.find((f) => f.region === "Lagos") ?? facilities[0];
  if (!luth) {
    console.log("No facility found — skipping stock/reconciliation seed");
    return;
  }

  for (const [i, d] of drugRows.entries()) {
    await db.insert(inventory).values({ facilityId: luth.id, drugId: d.id, quantity: 40 - i * 5 });
    // Half the drugs also stock the regional pool, matching the two-ledger model's real shape.
    if (i % 2 === 0) {
      await db.insert(inventory).values({ facilityId: null, drugId: d.id, quantity: 100 });
    }
  }
  console.log(`Seeded stock at ${luth.name} and the regional pool`);

  const flagged = drugRows[0]!;
  await db.insert(reconciliationRecord).values({
    facilityId: luth.id,
    weekEnding: new Date().toISOString().slice(0, 10),
    expectedQty: 40,
    actualQty: 36,
    variance: -4,
    status: "VARIANCE_FLAGGED",
  });
  console.log(`Seeded an open reconciliation variance for ${flagged.name} at ${luth.name}`);

  console.log("Inventory seed complete.");
}

// Run directly: npx tsx src/seed/inventory.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  seedInventory().catch(console.error);
}
