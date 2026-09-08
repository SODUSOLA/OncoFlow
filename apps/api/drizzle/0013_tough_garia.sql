CREATE TYPE "public"."biological_sex" AS ENUM('MALE', 'FEMALE');--> statement-breakpoint
CREATE TYPE "public"."bmi_classification" AS ENUM('UNDERWEIGHT', 'NORMAL', 'OVERWEIGHT', 'OBESE');--> statement-breakpoint
CREATE TYPE "public"."case_lock_resolution" AS ENUM('APPROVED_TO_PROCEED', 'REMAINS_BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."case_lock_resolved_by_role" AS ENUM('CLINICAL_DIRECTOR', 'CHIEF_CONSULTANT');--> statement-breakpoint
CREATE TYPE "public"."case_lock_status" AS ENUM('LOCKED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."case_lock_trigger" AS ENUM('CRCL_CRITICAL', 'QA_HOLD');--> statement-breakpoint
CREATE TYPE "public"."crcl_tier" AS ENUM('NORMAL', 'MILD_IMPAIRMENT', 'MODERATE_3A', 'MODERATE_SEVERE_3B', 'SEVERE');--> statement-breakpoint
CREATE TYPE "public"."lab_document_review_decision" AS ENUM('APPROVED', 'REJECTED', 'PROCEED_TO_CHEMO', 'HOLD_FROM_CHEMO', 'REVIEWED');--> statement-breakpoint
CREATE TYPE "public"."lab_document_review_stage" AS ENUM('ADMIN_DATE_CHECK', 'QA_CLINICAL_REVIEW', 'CLINICAL_DIRECTOR_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."lab_document_workflow_status" AS ENUM('PENDING_ADMIN_REVIEW', 'ADMIN_REJECTED', 'PENDING_QA_REVIEW', 'QA_HOLD', 'QA_APPROVED', 'PENDING_CLINICAL_DIRECTOR_REVIEW', 'CLINICAL_DIRECTOR_REVIEWED');--> statement-breakpoint
CREATE TYPE "public"."regimen_cycle_status" AS ENUM('SCHEDULED', 'COMPLETED', 'DELAYED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."regimen_status" AS ENUM('ACTIVE', 'COMPLETED', 'DISCONTINUED', 'PAUSED');--> statement-breakpoint
CREATE TYPE "public"."vital_source" AS ENUM('MANUAL_ENTRY', 'VIDEO_CONSULT', 'DEVICE_SYNC');--> statement-breakpoint
CREATE TYPE "public"."vital_type" AS ENUM('WEIGHT_KG', 'BLOOD_PRESSURE_SYSTOLIC', 'BLOOD_PRESSURE_DIASTOLIC', 'HEART_RATE_BPM', 'TEMPERATURE_C', 'SPO2_PERCENT');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "case_lock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"triggered_by" "case_lock_trigger" NOT NULL,
	"triggered_by_reference" uuid NOT NULL,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"status" "case_lock_status" DEFAULT 'LOCKED' NOT NULL,
	"resolved_by" uuid,
	"resolved_by_role" "case_lock_resolved_by_role",
	"resolution" "case_lock_resolution",
	"resolution_reason" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clinical_metrics_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"regimen_cycle_id" uuid,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp NOT NULL,
	"weight_kg" numeric NOT NULL,
	"height_cm" numeric NOT NULL,
	"age_years" integer NOT NULL,
	"sex" "biological_sex" NOT NULL,
	"bmi" numeric NOT NULL,
	"bmi_classification" "bmi_classification" NOT NULL,
	"bsa" numeric NOT NULL,
	"crcl" numeric NOT NULL,
	"crcl_tier" "crcl_tier" NOT NULL,
	"superseded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lab_analyte_reference" (
	"analyte_code" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"unit" text NOT NULL,
	"normal_low" numeric NOT NULL,
	"normal_high" numeric NOT NULL,
	"critical_low" numeric,
	"critical_high" numeric
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lab_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"file_id" uuid NOT NULL,
	"claimed_collection_date" date NOT NULL,
	"workflow_status" "lab_document_workflow_status" DEFAULT 'PENDING_ADMIN_REVIEW' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lab_document_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lab_document_id" uuid NOT NULL,
	"stage" "lab_document_review_stage" NOT NULL,
	"reviewed_by" uuid NOT NULL,
	"reviewed_at" timestamp DEFAULT now() NOT NULL,
	"decision" "lab_document_review_decision" NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nursing_lab_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinical_metrics_snapshot_id" uuid NOT NULL,
	"entered_by" uuid NOT NULL,
	"entered_at" timestamp NOT NULL,
	"source_lab_document_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nursing_lab_value" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nursing_lab_entry_id" uuid NOT NULL,
	"analyte_code" text NOT NULL,
	"value" numeric NOT NULL,
	"unit" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "regimen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"drug_name" varchar(255) NOT NULL,
	"protocol_code" varchar(100) NOT NULL,
	"total_cycles" integer NOT NULL,
	"cycle_interval_days" integer NOT NULL,
	"status" "regimen_status" DEFAULT 'ACTIVE' NOT NULL,
	"started_at" timestamp NOT NULL,
	"discontinued_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "regimen_cycle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"regimen_id" uuid NOT NULL,
	"cycle_number" integer NOT NULL,
	"scheduled_date" date NOT NULL,
	"administered_date" date,
	"status" "regimen_cycle_status" DEFAULT 'SCHEDULED' NOT NULL,
	"notes" text,
	"administered_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vital_reading" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"vital_type" "vital_type" NOT NULL,
	"value" numeric NOT NULL,
	"recorded_at" timestamp NOT NULL,
	"source" "vital_source" NOT NULL,
	"recorded_by" uuid,
	"meeting_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vital_reference_range" (
	"vital_type" "vital_type" PRIMARY KEY NOT NULL,
	"low" numeric NOT NULL,
	"high" numeric NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "case_lock" ADD CONSTRAINT "case_lock_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "case_lock" ADD CONSTRAINT "case_lock_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clinical_metrics_snapshot" ADD CONSTRAINT "clinical_metrics_snapshot_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clinical_metrics_snapshot" ADD CONSTRAINT "clinical_metrics_snapshot_regimen_cycle_id_regimen_cycle_id_fk" FOREIGN KEY ("regimen_cycle_id") REFERENCES "public"."regimen_cycle"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clinical_metrics_snapshot" ADD CONSTRAINT "clinical_metrics_snapshot_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lab_document" ADD CONSTRAINT "lab_document_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lab_document" ADD CONSTRAINT "lab_document_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lab_document" ADD CONSTRAINT "lab_document_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lab_document_review" ADD CONSTRAINT "lab_document_review_lab_document_id_lab_document_id_fk" FOREIGN KEY ("lab_document_id") REFERENCES "public"."lab_document"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lab_document_review" ADD CONSTRAINT "lab_document_review_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nursing_lab_entry" ADD CONSTRAINT "nursing_lab_entry_clinical_metrics_snapshot_id_clinical_metrics_snapshot_id_fk" FOREIGN KEY ("clinical_metrics_snapshot_id") REFERENCES "public"."clinical_metrics_snapshot"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nursing_lab_entry" ADD CONSTRAINT "nursing_lab_entry_entered_by_user_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nursing_lab_value" ADD CONSTRAINT "nursing_lab_value_nursing_lab_entry_id_nursing_lab_entry_id_fk" FOREIGN KEY ("nursing_lab_entry_id") REFERENCES "public"."nursing_lab_entry"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "regimen" ADD CONSTRAINT "regimen_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "regimen_cycle" ADD CONSTRAINT "regimen_cycle_regimen_id_regimen_id_fk" FOREIGN KEY ("regimen_id") REFERENCES "public"."regimen"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "regimen_cycle" ADD CONSTRAINT "regimen_cycle_administered_by_user_id_fk" FOREIGN KEY ("administered_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vital_reading" ADD CONSTRAINT "vital_reading_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vital_reading" ADD CONSTRAINT "vital_reading_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vital_reading" ADD CONSTRAINT "vital_reading_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_lock_patient_id_idx" ON "case_lock" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clinical_metrics_snapshot_patient_id_idx" ON "clinical_metrics_snapshot" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lab_document_patient_id_idx" ON "lab_document" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lab_document_review_lab_document_id_idx" ON "lab_document_review" USING btree ("lab_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "nursing_lab_entry_snapshot_id_unique" ON "nursing_lab_entry" USING btree ("clinical_metrics_snapshot_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nursing_lab_value_entry_id_idx" ON "nursing_lab_value" USING btree ("nursing_lab_entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regimen_patient_id_idx" ON "regimen" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regimen_cycle_regimen_id_idx" ON "regimen_cycle" USING btree ("regimen_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "regimen_cycle_regimen_id_cycle_number_unique" ON "regimen_cycle" USING btree ("regimen_id","cycle_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vital_reading_patient_id_vital_type_recorded_at_idx" ON "vital_reading" USING btree ("patient_id","vital_type","recorded_at");