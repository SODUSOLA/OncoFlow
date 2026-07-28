import { seedIdentity } from "./identity";
import { seedFacilities } from "./facility";
import { seedPatients } from "./patient";
import { seedBilling } from "./billing";

async function seed() {
  console.log("--- Seeding OncoFlow ---");
  await seedIdentity();
  await seedFacilities();
  await seedPatients();
  await seedBilling();
  console.log("--- Seeding complete ---");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
