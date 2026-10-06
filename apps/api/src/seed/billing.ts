import { db } from "../db/index.js";
import { sql, eq, and } from "drizzle-orm";
import crypto from "node:crypto";
import { serviceClassification, serviceSubOption, serviceSubOptionPrice, tariff, facility } from "../db/schema.js";

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

// Variants from the price list; each gets a flat price per tier in SUB_OPTION_PRICES.
const SUB_OPTIONS: Partial<Record<ClassificationName, { code: string; name: string }[]>> = {
  CONSULTATION: [
    { code: "SINGLE_VIRTUAL", name: "Single virtual consultation" },
    { code: "TRIO_VIRTUAL", name: "Trio virtual consultation (bundle)" },
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

// [medication, consumables, administration, professional fee, network fee, facility fee] in naira, non-subscriber then subscriber.
// Blood pints 2-5 only have a published total, so the network fee is held at the 1-pint figure and the remainder is booked as the blood product (medication).
type PriceRow = [number, number, number, number, number, number];
const SUB_OPTION_PRICES: Record<string, { nonSubscriber: PriceRow; subscriber: PriceRow }> = {
  TRIO_VIRTUAL: { nonSubscriber: [0, 0, 0, 105_000, 55_000, 0], subscriber: [0, 0, 0, 75_000, 35_000, 0] },
  SINGLE_VIRTUAL: { nonSubscriber: [0, 0, 0, 30_000, 20_000, 0], subscriber: [0, 0, 0, 25_000, 15_000, 0] },
  PHYSICAL: { nonSubscriber: [0, 0, 0, 65_000, 10_000, 0], subscriber: [0, 0, 0, 35_000, 25_000, 0] },
  CHEMOTHERAPY: { nonSubscriber: [0, 20_000, 75_000, 0, 30_000, 0], subscriber: [0, 10_000, 37_000, 0, 28_000, 0] },
  CHEMO_RADIATION: { nonSubscriber: [20_000, 10_000, 40_000, 0, 20_000, 0], subscriber: [15_000, 3_000, 22_000, 0, 20_000, 0] },
  SHORT_STAY_INFUSION: { nonSubscriber: [0, 10_000, 35_000, 0, 20_000, 0], subscriber: [0, 3_000, 22_000, 0, 15_000, 0] },
  BED_DAY: { nonSubscriber: [0, 0, 0, 0, 0, 10_000], subscriber: [0, 0, 0, 0, 0, 10_000] },
  BED_NIGHT: { nonSubscriber: [0, 0, 0, 0, 0, 10_000], subscriber: [0, 0, 0, 0, 0, 10_000] },
  BED_24H: { nonSubscriber: [0, 0, 0, 0, 0, 15_000], subscriber: [0, 0, 0, 0, 0, 15_000] },
  BLOOD_1_PINT: { nonSubscriber: [90_000, 20_000, 50_000, 0, 25_000, 0], subscriber: [80_000, 10_000, 45_000, 0, 15_000, 0] },
  BLOOD_2_PINT: { nonSubscriber: [275_000, 0, 0, 0, 25_000, 0], subscriber: [225_000, 0, 0, 0, 15_000, 0] },
  BLOOD_3_PINT: { nonSubscriber: [390_000, 0, 0, 0, 25_000, 0], subscriber: [330_000, 0, 0, 0, 15_000, 0] },
  BLOOD_4_PINT: { nonSubscriber: [505_000, 0, 0, 0, 25_000, 0], subscriber: [420_000, 0, 0, 0, 15_000, 0] },
  BLOOD_5_PINT: { nonSubscriber: [620_000, 0, 0, 0, 25_000, 0], subscriber: [525_000, 0, 0, 0, 15_000, 0] },
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
      const [row] = await db.insert(serviceSubOption)
        .values({ classificationId, code: o.code, name: o.name, sortOrder: i })
        .onConflictDoUpdate({ target: [serviceSubOption.classificationId, serviceSubOption.code], set: { name: o.name, sortOrder: i } })
        .returning();
      const prices = SUB_OPTION_PRICES[o.code];
      if (!row || !prices) continue;
      for (const [isSubscriber, p] of [[false, prices.nonSubscriber], [true, prices.subscriber]] as const) {
        const values = {
          medicationKobo: BigInt(p[0] * 100), consumablesKobo: BigInt(p[1] * 100), administrationKobo: BigInt(p[2] * 100),
          professionalFeeKobo: BigInt(p[3] * 100), networkFeeKobo: BigInt(p[4] * 100), facilityFeeKobo: BigInt(p[5] * 100),
        };
        await db.insert(serviceSubOptionPrice).values({ subOptionId: row.id, isSubscriber, ...values })
          .onConflictDoUpdate({ target: [serviceSubOptionPrice.subOptionId, serviceSubOptionPrice.isSubscriber], set: values });
      }
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
