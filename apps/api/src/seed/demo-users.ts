import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import crypto from "node:crypto";
import { user, userRole } from "../db/schema.js";
import { User } from "../modules/auth/index.js";

// Frontend dev/demo login accounts — one per stakeholder role, all sharing one password for
// convenience. `user` has no name column (only `patient` does — see auth/schema.ts), so the
// only place a "convincing" identity can live is the email address itself; apps/dashboard's
// DashboardLayout only ever renders user.email, never a separate display name.
const DEMO_PASSWORD = "DemoPass123!";

// PATIENT, SUPER_ADMIN, and the two national-level roles aren't tied to one facility
// (patient/schema.ts's own comment on user.facilityId) — every other role gets one, round-robin
// across the 5 seeded facilities below.
const DEMO_USERS: { email: string; password: string; roleName: string; facilityScoped: boolean }[] = [
  { email: "admin@oncoflow.dev", password: DEMO_PASSWORD, roleName: "SUPER_ADMIN", facilityScoped: false },
  { email: "funmilayo.bankole@oncoflow.dev", password: DEMO_PASSWORD, roleName: "REGIONAL_ADMIN", facilityScoped: true },
  { email: "chukwuemeka.obi@oncoflow.dev", password: DEMO_PASSWORD, roleName: "VIRTUAL_MEDICAL_OFFICER", facilityScoped: true },
  { email: "adaeze.nwankwo@oncoflow.dev", password: DEMO_PASSWORD, roleName: "CONSULTING_ONCOLOGIST", facilityScoped: true },
  { email: "babatunde.fashola@oncoflow.dev", password: DEMO_PASSWORD, roleName: "CONSULTING_SURGEON", facilityScoped: true },
  { email: "halima.yusuf@oncoflow.dev", password: DEMO_PASSWORD, roleName: "CONSULTING_NUTRITIONIST", facilityScoped: true },
  { email: "ifeoma.chukwu@oncoflow.dev", password: DEMO_PASSWORD, roleName: "CONSULTING_PSYCHO_ONCOLOGIST", facilityScoped: true },
  { email: "emeka.anyanwu@oncoflow.dev", password: DEMO_PASSWORD, roleName: "STATE_CLINICAL_DIRECTOR", facilityScoped: true },
  { email: "blessing.okoro@oncoflow.dev", password: DEMO_PASSWORD, roleName: "QUALITY_ASSURANCE_OFFICER", facilityScoped: true },
  { email: "grace.adeyemi@oncoflow.dev", password: DEMO_PASSWORD, roleName: "ONSITE_NURSING_OFFICER", facilityScoped: true },
  { email: "olumide.fagbenle@oncoflow.dev", password: DEMO_PASSWORD, roleName: "NATIONAL_CLINICAL_DIRECTOR", facilityScoped: false },
  { email: "patience.umeh@oncoflow.dev", password: DEMO_PASSWORD, roleName: "STATE_DIRECTOR_OF_NURSING_SERVICES", facilityScoped: true },
  { email: "comfort.nnamdi@oncoflow.dev", password: DEMO_PASSWORD, roleName: "NATIONAL_DIRECTOR_OF_NURSING_SERVICES", facilityScoped: false },
  { email: "tolu.adisa@oncoflow.dev", password: DEMO_PASSWORD, roleName: "SCRIBE", facilityScoped: true },
];

export async function seedDemoUsers() {
  const facilityRows = await db.execute<{ id: string; region: string }>(sql`SELECT id, region FROM facility ORDER BY name`);
  let facilityIndex = 0;
  // The pilot facility (LUTH, region "Lagos" — see 17-ideal-registration-onboarding-flow.md /
  // seed/billing.ts's own pilotFacility lookup) is the only one carrying real showcase
  // patients/invoices/tariffs/inventory stock. The lone REGIONAL_ADMIN demo account is pinned
  // here specifically so a login actually shows populated data, instead of round-robining onto
  // a facility (e.g. Kano) that only has the facility-agnostic staffing policy seeded.
  const pilotFacilityId = facilityRows.find((f) => f.region === "Lagos")?.id ?? facilityRows[0]?.id;

  for (const demo of DEMO_USERS) {
    const existingUser = await db.execute<{ id: string }>(
      sql`SELECT id FROM "user" WHERE email = ${demo.email} LIMIT 1`,
    );

    let userId: string;
    if (existingUser.length === 0) {
      userId = crypto.randomUUID();
      const passwordHash = await User.hashPassword(demo.password);
      const facilityId = !demo.facilityScoped
        ? null
        : demo.roleName === "REGIONAL_ADMIN"
          ? pilotFacilityId ?? null
          : facilityRows.length > 0
            ? facilityRows[facilityIndex++ % facilityRows.length]!.id
            : null;
      await db.insert(user).values({
        id: userId, email: demo.email, passwordHash, status: "ACTIVE", mfaEnabled: false, facilityId,
      });
      console.log(`  Created demo user: ${demo.email} (${demo.roleName})`);
    } else {
      userId = existingUser[0]!.id;
    }

    const roleRow = await db.execute<{ id: string }>(
      sql`SELECT id FROM "role" WHERE name = ${demo.roleName} LIMIT 1`,
    );
    if (roleRow.length === 0) {
      throw new Error(`Role ${demo.roleName} not found — run seed/identity.ts first`);
    }
    const roleId = roleRow[0]!.id;

    const existingAssignment = await db.execute(
      sql`SELECT id FROM user_role WHERE user_id = ${userId} AND role_id = ${roleId} LIMIT 1`,
    );
    if (existingAssignment.length === 0) {
      await db.insert(userRole).values({ id: crypto.randomUUID(), userId, roleId });
      console.log(`  Assigned ${demo.roleName} to ${demo.email}`);
    }
  }

  console.log(`Demo users seed complete — password for all: ${DEMO_PASSWORD}`);
}

// Guarded so importing this from seed/index.ts doesn't also trigger a second, racing
// invocation (see identity.ts's own comment on this pattern).
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDemoUsers().catch(console.error);
}
