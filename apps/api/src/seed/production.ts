import { seedIdentity } from "./identity.js";
import { seedFacilities } from "./facility.js";
import { seedBilling } from "./billing.js";
import { seedClinicalMetrics } from "./clinicalMetrics.js";

// Reference data a real deployment needs: roles and permissions, the facility list, billing classifications and flat
// prices, and the clinical reference ranges. No demo accounts, patients or stock, and nothing with a known password.
export async function seedReferenceData() {
  console.log("--- Seeding OncoFlow reference data ---");
  await seedIdentity();
  await seedFacilities();
  await seedBilling();
  await seedClinicalMetrics();
}

// Runs only when invoked directly, so the bootstrap script can import it.
if (import.meta.url === `file://${process.argv[1]}`) {
  seedReferenceData()
    .then(() => {
      console.log("--- Done. Create your first admin with: npm run create-admin -w apps/api ---");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
