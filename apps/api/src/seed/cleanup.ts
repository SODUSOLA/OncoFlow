import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

// Truncates every table in the public schema (CASCADE handles FK ordering) — a clean slate
// before reseeding. Schema/migrations are untouched; this only clears data. Local dev database
// only (DATABASE_URL in .env points at localhost:6432) — never point this at anything else.
export async function cleanup() {
  await db.execute(sql`
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;
  `);
  console.log("Database cleaned — all tables truncated.");
}

// Run directly: npx tsx src/seed/cleanup.ts
cleanup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Cleanup failed:", err);
    process.exit(1);
  });
