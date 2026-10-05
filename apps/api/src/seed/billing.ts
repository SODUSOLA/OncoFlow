import { db } from "../db/index.js";
import { sql, eq, and } from "drizzle-orm";
import crypto from "node:crypto";
import { serviceClassification, serviceSubOption, tariff, facility } from "../db/schema.js";

type ClassificationName =
  | "SUBSCRIPTION" | "CONSULTATION" | "DRUG_ADMINISTRATION" | "CHEMOTHERAPY" | "GENERAL_ADMISSION" | "PROCEDURE"
  | "SIDE_EFFECT_REPORT";

// Fee shares are fractions of the network fee; SIDE_EFFECT_REPORT is chat-only so all three are 0, and the 0.4 professional share is a placeholder.
const CLASSIFICATIONS: {
  name: ClassificationName; cappedNetworkFeeKobo: number;
  facilityShare: number; professionalShare: number; drugShare: number;
}[] = [
  { name: "SUBSCRIPTION", cappedNetworkFeeKobo: 0, facilityShare: 0, professionalShare: 0, drugShare: 0 },
  { name: "CONSULTATION", cappedNetworkFeeKobo: 5_000_00, facilityShare: 0.6, professionalShare: 0.4, drugShare: 0.3 },
  { name: "DRUG_ADMINISTRATION", cappedNetworkFeeKobo: 2_000_00, facilityShare: 0.6, professionalShare: 0.4, drugShare: 0.3 },
  { name: "CHEMOTHERAPY", cappedNetworkFeeKobo: 10_000_00, facilityShare: 0.6, professionalShare: 0.4, drugShare: 0.3 },
  { name: "GENERAL_ADMISSION", cappedNetworkFeeKobo: 3_000_00, facilityShare: 0.6, professionalShare: 0.4, drugShare: 0.3 },
  { name: "PROCEDURE", cappedNetworkFeeKobo: 8_000_00, facilityShare: 0.6, professionalShare: 0.4, drugShare: 0.3 },
  // Day-rate reference only; the real fee is computed per invoice by side-effect-pricing.ts.
  { name: "SIDE_EFFECT_REPORT", cappedNetworkFeeKobo: 3_000_00, facilityShare: 0, professionalShare: 0, drugShare: 0 },
];

// Variants from the price list. Descriptive labels only; pricing stays on the per-facility classification tariff.
const SUB_OPTIONS: Partial<Record<ClassificationName, { code: string; name: string }[]>> = {
  CONSULTATION: [
    { code: "TRIO_VIRTUAL", name: "Trio virtual consultation (bundle)" },
    { code: "SINGLE_VIRTUAL", name: "Single virtual consultation" },
    { code: "PHYSICAL", name: "Physical consultation" },
  ],
  CHEMOTHERAPY: [
    { code: "CHEMOTHERAPY", name: "Chemotherapy" },
    { code: "CHEMO_RADIATION", name: "Chemo-radiation" },
  ],
  DRUG_ADMINISTRATION: [
    { code: "SHORT_STAY_INFUSION", name: "Short stay supportive injections / infusions" },
  ],
  GENERAL_ADMISSION: [
    { code: "BED_DAY", name: "Bed space (9am - 5pm)" },
    { code: "BED_NIGHT", name: "Bed space (5pm - 9am)" },
    { code: "BED_24H", name: "Bed space (24 hours)" },
  ],
  PROCEDURE: [1, 2, 3, 4, 5].map((n) => ({ code: `BLOOD_${n}_PINT`, name: `Blood transfusion (${n} ${n === 1 ? "pint" : "pints"})` })),
};

// Seeds service classifications and pilot-facility tariffs.
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

    const options = SUB_OPTIONS[c.name] ?? [];
    for (const [i, o] of options.entries()) {
      await db.insert(serviceSubOption)
        .values({ classificationId, code: o.code, name: o.name, sortOrder: i })
        .onConflictDoNothing();
    }

    // SUBSCRIPTION has no tariff and SIDE_EFFECT_REPORT is priced dynamically, so neither gets a tariff row.
    if (c.name === "SUBSCRIPTION" || c.name === "SIDE_EFFECT_REPORT" || !pilotFacility) continue;

    const existingTariff = await db.select().from(tariff)
      .where(and(eq(tariff.facilityId, pilotFacility.id), eq(tariff.classificationId, classificationId)))
      .limit(1);

    const professionalFeeKobo = BigInt(Math.floor(c.cappedNetworkFeeKobo * c.professionalShare));

    if (existingTariff.length > 0) {
      // Backfills the new professional_fee_kobo column in place for pre-existing rows.
      if (existingTariff[0]!.professionalFeeKobo === 0n) {
        await db.update(tariff).set({ professionalFeeKobo }).where(eq(tariff.id, existingTariff[0]!.id));
        console.log(`  Backfilled professionalFeeKobo for ${c.name} at ${pilotFacility.name}`);
      }
      continue;
    }

    await db.insert(tariff).values({
      id: crypto.randomUUID(),
      facilityId: pilotFacility.id,
      classificationId,
      networkFeeKobo: BigInt(c.cappedNetworkFeeKobo),
      facilityBedFeeKobo: BigInt(Math.floor(c.cappedNetworkFeeKobo * c.facilityShare)),
      professionalFeeKobo,
      drugPriceKobo: BigInt(Math.floor(c.cappedNetworkFeeKobo * c.drugShare)),
    });
    console.log(`  Created tariff for ${c.name} at ${pilotFacility.name}`);
  }

  console.log("Billing seed complete.");
}

// Guarded so importing this from seed/index.ts doesn't trigger a second racing run.
if (import.meta.url === `file://${process.argv[1]}`) {
  seedBilling().catch(console.error);
}
