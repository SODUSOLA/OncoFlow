ALTER TABLE "facility" ADD COLUMN "latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "facility" ADD COLUMN "longitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "facility_confirmed_at" timestamp;--> statement-breakpoint
--> Added with a temporary default so the NOT NULL add succeeds against a table that already
--> has rows (a bare NOT NULL add would abort). Pre-existing pending registrations predate the
--> biological-sex field, so "Unknown" is the honest backfill — Admin confirms/corrects it at
--> facility-confirmation time. Default dropped immediately so new rows must supply a real value.
ALTER TABLE "patient_registration_request" ADD COLUMN "gender" varchar(32) NOT NULL DEFAULT 'Unknown';--> statement-breakpoint
ALTER TABLE "patient_registration_request" ALTER COLUMN "gender" DROP DEFAULT;