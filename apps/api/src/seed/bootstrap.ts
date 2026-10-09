import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { seedReferenceData } from "./production.js";
import { ensureAdmin, ensureStaffAccount } from "./create-admin.js";

// First-boot setup for hosts with no shell (for example Render's free plan), run after the migrations on every start
// and cheap once done: it seeds the reference data only into an empty database, and creates the admin named by
// ADMIN_EMAIL and ADMIN_PASSWORD only if that account does not exist. It never fails the boot.
async function bootstrap() {
  const counts = await db.execute<{ roles: number; facilities: number }>(
    sql`SELECT (SELECT COUNT(*) FROM "role")::int AS roles, (SELECT COUNT(*) FROM facility)::int AS facilities`,
  );
  const empty = !counts[0] || counts[0].roles === 0 || counts[0].facilities === 0;
  if (empty) await seedReferenceData();
  else console.log("Reference data already present, skipping seed.");

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    await ensureAdmin({ email, password, firstName: process.env.ADMIN_FIRST_NAME, lastName: process.env.ADMIN_LAST_NAME });
  } else {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set, skipping admin creation.");
  }

  // The first Regional Admin, which the app cannot create itself (provisioning only covers field roles). They are placed
  // at REGIONAL_ADMIN_FACILITY (a name or part of one), or the first facility alphabetically, and their region follows it.
  const raEmail = process.env.REGIONAL_ADMIN_EMAIL;
  const raPassword = process.env.REGIONAL_ADMIN_PASSWORD;
  if (raEmail && raPassword) {
    const wanted = process.env.REGIONAL_ADMIN_FACILITY?.trim();
    const rows = await db.execute<{ id: string; name: string }>(
      wanted
        ? sql`SELECT id, name FROM facility WHERE is_deleted = false AND name ILIKE ${`%${wanted}%`} ORDER BY name LIMIT 1`
        : sql`SELECT id, name FROM facility WHERE is_deleted = false ORDER BY name LIMIT 1`,
    );
    if (!rows[0]) throw new Error(`No facility found for REGIONAL_ADMIN_FACILITY="${wanted ?? ""}"`);
    console.log(`Regional Admin will be placed at ${rows[0].name}`);
    await ensureStaffAccount({
      email: raEmail, password: raPassword, roleName: "REGIONAL_ADMIN", facilityId: rows[0].id,
      firstName: process.env.REGIONAL_ADMIN_FIRST_NAME ?? "Regional", lastName: process.env.REGIONAL_ADMIN_LAST_NAME ?? "Admin",
    });
  }
}

bootstrap()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Bootstrap failed (the API will still start):", err instanceof Error ? err.message : err);
    process.exit(0);
  });
