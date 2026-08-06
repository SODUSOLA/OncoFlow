import { seedIdentity } from "./identity.js";
import { seedFacilities } from "./facility.js";
import { seedPatients } from "./patient.js";
import { seedBilling } from "./billing.js";
import { seedDemoUsers } from "./demo-users.js";

async function seed() {
  console.log("--- Seeding OncoFlow ---");
  await seedIdentity();
  await seedFacilities();
  await seedDemoUsers();
  await seedPatients();
  await seedBilling();
  console.log("--- Seeding complete ---");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
