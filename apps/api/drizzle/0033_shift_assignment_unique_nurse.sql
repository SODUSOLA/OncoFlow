-- Existing duplicates (the same nurse rostered more than once on one shift) are soft-deleted, keeping the earliest, so the unique index can be built.
UPDATE "shift_assignment" SET "is_deleted" = true
WHERE "is_deleted" = false AND "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (
      PARTITION BY "user_id", "facility_id", "weekday", "iso_year", "iso_week" ORDER BY "assigned_at", "id"
    ) AS rn
    FROM "shift_assignment" WHERE "is_deleted" = false
  ) ranked WHERE rn > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shift_assignment_one_nurse_per_shift" ON "shift_assignment" USING btree ("user_id","facility_id","weekday","iso_year","iso_week") WHERE "shift_assignment"."is_deleted" = false;