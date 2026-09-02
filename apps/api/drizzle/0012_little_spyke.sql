--> Drift repair. `mfa_secret` has existed in schema.ts (and in every db:push'd database) since
--> TOTP was implemented, but no migration ever created it — migrations 0003-0011 were applied
--> with `db:push`, which does not write to drizzle.__drizzle_migrations. A migration-based
--> deploy would therefore have built a `user` table with no `mfa_secret`, and every MFA
--> enrolment/verification would fail at runtime against a missing column.
--> IF NOT EXISTS because environments already carrying the column from a db:push must be able
--> to run this migration without aborting; on a fresh database it behaves as a plain ADD COLUMN.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "mfa_secret" varchar(256);
