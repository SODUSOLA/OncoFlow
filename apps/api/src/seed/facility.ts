import { db } from "../db/index.js";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { facility, department } from "../db/schema.js";

// Lagos oncology facilities. Coordinates are approximate centres of each facility's area (not surveyed), used only by the
// registration wizard's client-side distance sort; addresses are the area, since street addresses were not supplied.
const FACILITIES = [
  { name: "Medserve-LUTH Cancer Centre / NSIA-LUTH Cancer Centre", area: "Idi-Araba / Surulere", description: "Comprehensive oncology — chemotherapy, radiotherapy, oncology consultations, cancer treatment", latitude: "6.5176", longitude: "3.3579" },
  { name: "Cancer Screening & Treatment Centre, LASUTH", area: "Ikeja", description: "Cancer screening, diagnosis, oncology; linked to LASUTH's wider oncology services", latitude: "6.5964", longitude: "3.3503" },
  { name: "Lakeshore Cancer Center - Victoria Island", area: "Victoria Island", description: "Dedicated cancer centre — screening, diagnosis, chemotherapy, treatment, supportive/palliative care", latitude: "6.4281", longitude: "3.4219" },
  { name: "Lakeshore Cancer Center - Ikeja", area: "Ikeja GRA", description: "Oncology consultation, cancer treatment/support, palliative and home care", latitude: "6.5846", longitude: "3.3568" },
  { name: "Marcelle Ruth Cancer Centre & Specialist Hospital", area: "Victoria Island", description: "Comprehensive cancer care — chemotherapy, radiotherapy/LINAC, immunotherapy, surgery, supportive care", latitude: "6.4312", longitude: "3.4156" },
  { name: "Pearl Oncology Specialist Hospital", area: "Lekki Phase 1", description: "Oncology consultations, chemotherapy, immunotherapy, hormonal therapy, targeted therapy, surgical oncology", latitude: "6.4474", longitude: "3.4723" },
  { name: "Genesis Specialist Hospital", area: "Ikeja GRA", description: "Oncology/cancer treatment, chemotherapy, cancer surgery and coordinated specialist care", latitude: "6.5810", longitude: "3.3520" },
  { name: "Iwosan Lagoon Hospitals, Ikoyi", area: "Ikoyi", description: "Medical oncology and specialist/tertiary cancer-related care", latitude: "6.4531", longitude: "3.4339" },
  { name: "St. Nicholas Hospital / Oncology", area: "Lagos Island", description: "Oncology/haematology and hospital-based cancer care", latitude: "6.4549", longitude: "3.3947" },
  { name: "Renaissance Medical Centre", area: "Victoria Island", description: "Oncology, particularly breast cancer screening, diagnosis and surgical oncology", latitude: "6.4300", longitude: "3.4250" },
  { name: "FMC Cancer Center / Federal Medical Centre", area: "Ebute-Metta", description: "Public tertiary oncology service; cancer screening/oncology management", latitude: "6.4894", longitude: "3.3744" },
  { name: "Gbagada General Hospital", area: "Gbagada", description: "Oncology department listed", latitude: "6.5575", longitude: "3.3898" },
  { name: "Eko Hospital", area: "Ikeja", description: "Oncology department; cancer treatment/specialist care", latitude: "6.6010", longitude: "3.3515" },
  { name: "Evercare Hospital", area: "Lekki", description: "Oncology department and specialist cancer care", latitude: "6.4367", longitude: "3.4695" },
  { name: "Lagoon Hospital – Ikeja", area: "Ikeja", description: "Oncology department", latitude: "6.6030", longitude: "3.3560" },
  { name: "Lagoon Hospital – Victoria Island", area: "Victoria Island", description: "Oncology department", latitude: "6.4272", longitude: "3.4280" },
  { name: "Medserve Cancer Centre", area: "Surulere/Idi-Araba", description: "Dedicated oncology treatment centre", latitude: "6.5120", longitude: "3.3600" },
  { name: "Orile-Agege General Hospital", area: "Agege", description: "Oncology department listed", latitude: "6.6180", longitude: "3.3120" },
  { name: "Sameda Clinics", area: "Lekki Phase 1", description: "Oncology department listed", latitude: "6.4490", longitude: "3.4700" },
  { name: "Bose Specialist Hospital", area: "Oshodi-Isolo", description: "Oncology services listed", latitude: "6.5570", longitude: "3.3470" },
  { name: "Charis Medical Centre", area: "Bariga/Shomolu", description: "Oncology, radiotherapy and cancer treatment listed", latitude: "6.5360", longitude: "3.3880" },
  { name: "Bee-Hess Hospital", area: "Egbeda/Akowonjo", description: "Cancer care listed", latitude: "6.6140", longitude: "3.2900" },
  { name: "Marigold Hospital & Critical Care Centre", area: "Surulere/Kilo", description: "Cancer diagnosis/assessment/treatment support", latitude: "6.5290", longitude: "3.3610" },
  { name: "MeCure Cancer Center", area: "Mushin/Oshodi area", description: "Cancer-focused diagnostics and multidisciplinary oncology care", latitude: "6.5350", longitude: "3.3500" },
  { name: "OAK Cancer Specialist Hospitals", area: "Idi-Oro/Surulere", description: "Screening, diagnostics, chemotherapy, supportive/palliative care; radiotherapy referral pathways", latitude: "6.5320", longitude: "3.3480" },
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

// Seeds the Lagos oncology facilities (and their departments), skipping any that already exist by name.
export async function seedFacilities() {
  const existing = await db.select({ name: facility.name }).from(facility).where(eq(facility.isDeleted, false));
  const have = new Set(existing.map((f) => f.name));
  let created = 0;

  for (const f of FACILITIES) {
    if (have.has(f.name)) continue;
    const facId = crypto.randomUUID();
    await db.insert(facility).values({
      id: facId,
      name: f.name,
      region: "Lagos",
      address: `${f.area}, Lagos`,
      description: f.description,
      latitude: f.latitude,
      longitude: f.longitude,
      status: "ACTIVE",
    });

    for (const dept of DEPARTMENTS) {
      await db.insert(department).values({ id: crypto.randomUUID(), facilityId: facId, name: dept });
    }
    created++;
  }

  console.log(`Seeded ${created} facilities with ${DEPARTMENTS.length} departments each`);
}

// Guarded so importing this from seed/index.ts doesn't trigger a second racing run.
if (import.meta.url === `file://${process.argv[1]}`) {
  seedFacilities().catch(console.error);
}
