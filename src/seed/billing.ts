import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import crypto from "node:crypto";
import { serviceClassification, tariff, facility } from "../db/schema.js";

const CLASSIFICATIONS: { name: "SUBSCRIPTION" | "CONSULTATION" | "DRUG_ADMINISTRATION" | "CHEMOTHERAPY" | "GENERAL_ADMISSION" | "PROCEDURE"; cappedNetworkFeeKobo: number }[] = [
  { name: "SUBSCRIPTION", cappedNetworkFeeKobo: 0 },
  { name: "CONSULTATION", cappedNetworkFeeKobo: 5_000_00 },
  { name: "DRUG_ADMINISTRATION", cappedNetworkFeeKobo: 2_000_00 },
  { name: "CHEMOTHERAPY", cappedNetworkFeeKobo: 10_000_00 },
  { name: "GENERAL_ADMISSION", cappedNetworkFeeKobo: 3_000_00 },
  { name: "PROCEDURE", cappedNetworkFeeKobo: 8_000_00 },
];

export async function seedBilling() {
  const existing = await db.select().from(serviceClassification).limit(1);
  if (existing.length > 0) {
    console.log("Service classifications already seeded, skipping");
    return;
  }

  const classificationIds: Record<string, string> = {};

  for (const c of CLASSIFICATIONS) {
    const id = crypto.randomUUID();
    await db.insert(serviceClassification).values({
      id,
      name: c.name,
      cappedNetworkFeeKobo: BigInt(c.cappedNetworkFeeKobo),
    });
    classificationIds[c.name] = id;
    console.log(`  Created classification: ${c.name}`);
  }

  const facilities = await db.select().from(facility).where(sql`${facility.isDeleted} = false`);

  if (facilities.length > 0) {
    const pilotFacility = facilities.find((f) => f.region === "Lagos") ?? facilities[0]!;

    for (const [name, id] of Object.entries(classificationIds)) {
      if (name === "SUBSCRIPTION") continue;

      await db.insert(tariff).values({
        id: crypto.randomUUID(),
        facilityId: pilotFacility.id,
        classificationId: id,
        networkFeeKobo: BigInt(CLASSIFICATIONS.find((c) => c.name === name)!.cappedNetworkFeeKobo),
        facilityBedFeeKobo: BigInt(Math.floor(CLASSIFICATIONS.find((c) => c.name === name)!.cappedNetworkFeeKobo * 0.6)),
        drugPriceKobo: BigInt(Math.floor(CLASSIFICATIONS.find((c) => c.name === name)!.cappedNetworkFeeKobo * 0.3)),
      });
    }

    console.log(`  Created tariffs for facility: ${pilotFacility.name}`);
  }

  console.log("Billing seed complete.");
}

seedBilling().catch(console.error);
