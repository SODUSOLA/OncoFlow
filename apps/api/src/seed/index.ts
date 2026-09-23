import { seedIdentity } from "./identity.js";
import { seedFacilities } from "./facility.js";
import { seedPatients } from "./patient.js";
import { seedBilling } from "./billing.js";
import { seedDemoUsers } from "./demo-users.js";
import { seedShowcasePatient } from "./showcase-patient.js";
import { seedStaffing } from "./staffing.js";
import { seedInventory } from "./inventory.js";
import { seedClinicalMetrics } from "./clinicalMetrics.js";

// Runs every seed script in dependency order.
async function seed() {
  console.log("--- Seeding OncoFlow ---");
  await seedIdentity();
  await seedFacilities();
  await seedDemoUsers();
  await seedPatients();
  await seedBilling();
  await seedShowcasePatient();
  await seedStaffing();
  await seedInventory();
  await seedClinicalMetrics();
  console.log("--- Seeding complete ---");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
