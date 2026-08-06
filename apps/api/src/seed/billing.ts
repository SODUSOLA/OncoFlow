import { db } from "../db/index.js";
import { sql, eq, and } from "drizzle-orm";
import crypto from "node:crypto";
import { serviceClassification, tariff, facility } from "../db/schema.js";

type ClassificationName =
  | "SUBSCRIPTION" | "CONSULTATION" | "DRUG_ADMINISTRATION" | "CHEMOTHERAPY" | "GENERAL_ADMISSION" | "PROCEDURE"
  | "SIDE_EFFECT_REPORT";

// facilityFeeShare/drugShare are fractions of the network fee, matching the ~0.6/~0.3 split
// every other classification here already uses — SIDE_EFFECT_REPORT is a pure chat-based
// consult with no facility/drug component, so both are 0.
const CLASSIFICATIONS: { name: ClassificationName; cappedNetworkFeeKobo: number; facilityShare: number; drugShare: number }[] = [
  { name: "SUBSCRIPTION", cappedNetworkFeeKobo: 0, facilityShare: 0, drugShare: 0 },
  { name: "CONSULTATION", cappedNetworkFeeKobo: 5_000_00, facilityShare: 0.6, drugShare: 0.3 },
  { name: "DRUG_ADMINISTRATION", cappedNetworkFeeKobo: 2_000_00, facilityShare: 0.6, drugShare: 0.3 },
  { name: "CHEMOTHERAPY", cappedNetworkFeeKobo: 10_000_00, facilityShare: 0.6, drugShare: 0.3 },
  { name: "GENERAL_ADMISSION", cappedNetworkFeeKobo: 3_000_00, facilityShare: 0.6, drugShare: 0.3 },
  { name: "PROCEDURE", cappedNetworkFeeKobo: 8_000_00, facilityShare: 0.6, drugShare: 0.3 },
  // Day-rate reference only — the actual per-invoice fee is computed dynamically by
  // side-effect-pricing.ts (₦3,000 day / ₦5,000 night), not read from a Tariff row.
  { name: "SIDE_EFFECT_REPORT", cappedNetworkFeeKobo: 3_000_00, facilityShare: 0, drugShare: 0 },
];

export async function seedBilling() {
  const facilities = await db.select().from(facility).where(sql`${facility.isDeleted} = false`);
  const pilotFacility = facilities.find((f) => f.region === "Lagos") ?? facilities[0];

  for (const c of CLASSIFICATIONS) {
    const existingRows = await db.select().from(serviceClassification)
      .where(sql`${serviceClassification.name}::text = ${c.name}`).limit(1);

    let classificationId: string;
    if (existingRows.length > 0) {
      classificationId = existingRows[0]!.id;
    } else {
      classificationId = crypto.randomUUID();
      await db.insert(serviceClassification).values({
        id: classificationId,
        name: c.name,
        cappedNetworkFeeKobo: BigInt(c.cappedNetworkFeeKobo),
      });
      console.log(`  Created classification: ${c.name}`);
    }

    // SUBSCRIPTION has no tariff (billed on its own cycle); SIDE_EFFECT_REPORT's fee is
    // computed dynamically per invoice (time-of-day), not read from a Tariff row.
    if (c.name === "SUBSCRIPTION" || c.name === "SIDE_EFFECT_REPORT" || !pilotFacility) continue;

    const existingTariff = await db.select().from(tariff)
      .where(and(eq(tariff.facilityId, pilotFacility.id), eq(tariff.classificationId, classificationId)))
      .limit(1);
    if (existingTariff.length > 0) continue;

    await db.insert(tariff).values({
      id: crypto.randomUUID(),
      facilityId: pilotFacility.id,
      classificationId,
      networkFeeKobo: BigInt(c.cappedNetworkFeeKobo),
      facilityBedFeeKobo: BigInt(Math.floor(c.cappedNetworkFeeKobo * c.facilityShare)),
      drugPriceKobo: BigInt(Math.floor(c.cappedNetworkFeeKobo * c.drugShare)),
    });
    console.log(`  Created tariff for ${c.name} at ${pilotFacility.name}`);
  }

  console.log("Billing seed complete.");
}

// Guarded so importing this from seed/index.ts doesn't also trigger a second, racing
// invocation (see identity.ts's own comment on this pattern).
if (import.meta.url === `file://${process.argv[1]}`) {
  seedBilling().catch(console.error);
}
