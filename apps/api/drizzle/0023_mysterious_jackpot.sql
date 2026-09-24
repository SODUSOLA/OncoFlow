CREATE TABLE IF NOT EXISTS "identity_mismatch_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nursing_case_id" uuid NOT NULL,
	"reported_by" uuid NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vital_reading" ADD COLUMN "nursing_case_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "identity_mismatch_report" ADD CONSTRAINT "identity_mismatch_report_nursing_case_id_nursing_case_id_fk" FOREIGN KEY ("nursing_case_id") REFERENCES "public"."nursing_case"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "identity_mismatch_report" ADD CONSTRAINT "identity_mismatch_report_reported_by_user_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vital_reading" ADD CONSTRAINT "vital_reading_nursing_case_id_nursing_case_id_fk" FOREIGN KEY ("nursing_case_id") REFERENCES "public"."nursing_case"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
