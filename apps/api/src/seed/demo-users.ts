import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import crypto from "node:crypto";
import { user, userRole } from "../db/schema.js";
import { User } from "../modules/auth/index.js";

// Demo login accounts, one per role with one shared password; the dashboard only shows user.email, so identity lives in the address.
const DEMO_PASSWORD = "DemoPass123!";

// PATIENT, SUPER_ADMIN and the national roles aren't tied to one facility; every other role is assigned one round-robin.
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

// Seeds a demo staff login per role.
export async function seedDemoUsers() {
  const facilityRows = await db.execute<{ id: string; region: string }>(sql`SELECT id, region FROM facility ORDER BY name`);
  let facilityIndex = 0;
  // The lone REGIONAL_ADMIN and ONSITE_NURSING_OFFICER are pinned to the pilot Lagos facility, the only one with showcase data, so the nurse's requests fall in the admin's region.
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
        : demo.roleName === "REGIONAL_ADMIN" || demo.roleName === "ONSITE_NURSING_OFFICER"
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

// Guarded so importing this from seed/index.ts doesn't trigger a second racing run.
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDemoUsers().catch(console.error);
}
