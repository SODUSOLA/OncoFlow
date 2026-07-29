ALTER TABLE "wallet" ALTER COLUMN "balance_kobo" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "facility_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user" ADD CONSTRAINT "user_facility_id_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facility"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_facility_idx" ON "user" USING btree ("facility_id");