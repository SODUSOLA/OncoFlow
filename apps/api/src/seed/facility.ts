import { db } from "../db/index.js";
import crypto from "node:crypto";
import { facility, department } from "../db/schema.js";

// Coordinates are the real-world locations of each hospital — used by the registration
// wizard's client-side haversine distance sort (request #2), not just display data.
const FACILITIES = [
  {
    name: "Lagos University Teaching Hospital Oncology Centre",
    region: "Lagos",
    address: "1-5 Ishaga Road, Idi-Araba, Lagos",
    latitude: "6.5244",
    longitude: "3.3792",
  },
  {
    name: "University College Hospital Ibadan Cancer Institute",
    region: "Oyo",
    address: "Queen Elizabeth Road, Ibadan",
    latitude: "7.4041",
    longitude: "3.9083",
  },
  {
    name: "National Hospital Abuja Oncology Unit",
    region: "FCT",
    address: "Plot 132, Central District, Abuja",
    latitude: "9.0579",
    longitude: "7.4951",
  },
  {
    name: "Aminu Kano Teaching Hospital Oncology Department",
    region: "Kano",
    address: "No. 1 Zaria Road, Kano",
    latitude: "12.0022",
    longitude: "8.5920",
  },
  {
    name: "University of Benin Teaching Hospital Cancer Centre",
    region: "Edo",
    address: "PMB 1111, Ugbowo, Benin City",
    latitude: "6.4025",
    longitude: "5.6206",
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
      latitude: f.latitude,
      longitude: f.longitude,
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

// Run directly: npx tsx src/seed/facility.ts — guarded so importing this from seed/index.ts
// doesn't also trigger a second, racing invocation (see identity.ts's own comment on this).
if (import.meta.url === `file://${process.argv[1]}`) {
  seedFacilities().catch(console.error);
}
