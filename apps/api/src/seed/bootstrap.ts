import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { seedReferenceData } from "./production.js";
import { ensureAdmin } from "./create-admin.js";

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
}

bootstrap()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Bootstrap failed (the API will still start):", err instanceof Error ? err.message : err);
    process.exit(0);
  });
