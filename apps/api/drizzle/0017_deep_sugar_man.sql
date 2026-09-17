CREATE TYPE "public"."nursing_case_review_decision" AS ENUM('REQUIREMENTS_INCOMPLETE', 'REQUIREMENTS_MET');--> statement-breakpoint
CREATE TYPE "public"."nursing_case_status" AS ENUM('STARTED', 'PENDING_QA_REVIEW', 'CLOSED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nursing_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"regimen_cycle_id" uuid NOT NULL,
	"started_by" uuid NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"status" "nursing_case_status" DEFAULT 'STARTED' NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nursing_case_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nursing_case_id" uuid NOT NULL,
	"reviewed_by" uuid NOT NULL,
	"reviewed_at" timestamp DEFAULT now() NOT NULL,
	"decision" "nursing_case_review_decision" NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nursing_documentation_sheet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nursing_case_id" uuid NOT NULL,
	"authored_by" uuid NOT NULL,
	"upi_code_entered" text NOT NULL,
	"id_photo_file_id" uuid NOT NULL,
	"identity_verified_at" timestamp NOT NULL,
	"file_reference" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "upload_security_incident" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nursing_case_id" uuid,
	"attempted_by" uuid NOT NULL,
	"file_scan_result" text NOT NULL,
	"incident_reference" varchar(32) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nursing_case" ADD CONSTRAINT "nursing_case_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nursing_case" ADD CONSTRAINT "nursing_case_regimen_cycle_id_regimen_cycle_id_fk" FOREIGN KEY ("regimen_cycle_id") REFERENCES "public"."regimen_cycle"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nursing_case" ADD CONSTRAINT "nursing_case_started_by_user_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nursing_case" ADD CONSTRAINT "nursing_case_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nursing_case_review" ADD CONSTRAINT "nursing_case_review_nursing_case_id_nursing_case_id_fk" FOREIGN KEY ("nursing_case_id") REFERENCES "public"."nursing_case"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nursing_case_review" ADD CONSTRAINT "nursing_case_review_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nursing_documentation_sheet" ADD CONSTRAINT "nursing_documentation_sheet_nursing_case_id_nursing_case_id_fk" FOREIGN KEY ("nursing_case_id") REFERENCES "public"."nursing_case"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nursing_documentation_sheet" ADD CONSTRAINT "nursing_documentation_sheet_authored_by_user_id_fk" FOREIGN KEY ("authored_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nursing_documentation_sheet" ADD CONSTRAINT "nursing_documentation_sheet_id_photo_file_id_file_id_fk" FOREIGN KEY ("id_photo_file_id") REFERENCES "public"."file"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nursing_documentation_sheet" ADD CONSTRAINT "nursing_documentation_sheet_file_reference_file_id_fk" FOREIGN KEY ("file_reference") REFERENCES "public"."file"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_security_incident" ADD CONSTRAINT "upload_security_incident_nursing_case_id_nursing_case_id_fk" FOREIGN KEY ("nursing_case_id") REFERENCES "public"."nursing_case"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_security_incident" ADD CONSTRAINT "upload_security_incident_attempted_by_user_id_fk" FOREIGN KEY ("attempted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
