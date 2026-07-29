import { db } from "../db/index.js";
import crypto from "node:crypto";
import { facility, department } from "../db/schema.js";

const FACILITIES = [
  {
    name: "Lagos University Teaching Hospital Oncology Centre",
    region: "Lagos",
    address: "1-5 Ishaga Road, Idi-Araba, Lagos",
  },
  {
    name: "University College Hospital Ibadan Cancer Institute",
    region: "Oyo",
    address: "Queen Elizabeth Road, Ibadan",
  },
  {
    name: "National Hospital Abuja Oncology Unit",
    region: "FCT",
    address: "Plot 132, Central District, Abuja",
  },
  {
    name: "Aminu Kano Teaching Hospital Oncology Department",
    region: "Kano",
    address: "No. 1 Zaria Road, Kano",
  },
  {
    name: "University of Benin Teaching Hospital Cancer Centre",
    region: "Edo",
    address: "PMB 1111, Ugbowo, Benin City",
  },
];

const DEPARTMENTS = [
  "Medical Oncology",
  "Radiation Oncology",
  "Surgical Oncology",
  "Paediatric Oncology",
  "Oncology Nursing",
  "Palliative Care",
  "Pharmacy",
  "Radiology",
  "Pathology",
  "Administration",
];

export async function seedFacilities() {
  const existing = await db.select().from(facility).limit(1);
  if (existing.length > 0) {
    console.log("Facilities already seeded, skipping");
    return;
  }

  for (const f of FACILITIES) {
    const facId = crypto.randomUUID();
    await db.insert(facility).values({
      id: facId,
      name: f.name,
      region: f.region,
      address: f.address,
      status: "ACTIVE",
    });

    for (const dept of DEPARTMENTS) {
      await db.insert(department).values({
        id: crypto.randomUUID(),
        facilityId: facId,
        name: dept,
      });
    }
  }

  console.log(`Seeded ${FACILITIES.length} facilities with ${DEPARTMENTS.length} departments each`);
}

// Run directly: npx tsx src/seed/facility.ts
seedFacilities().catch(console.error);
