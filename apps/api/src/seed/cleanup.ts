import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

// Truncates every public table for a clean reseed, leaving schema and migrations intact; local dev database only.
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
