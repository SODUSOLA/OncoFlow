ALTER TYPE "public"."vital_type" ADD VALUE 'RESPIRATION_RATE';--> statement-breakpoint
ALTER TABLE "nursing_documentation_sheet" ALTER COLUMN "file_reference" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "nursing_documentation_sheet" ADD COLUMN "diagnosis" text;--> statement-breakpoint
ALTER TABLE "nursing_documentation_sheet" ADD COLUMN "managing_consultant" text;--> statement-breakpoint
ALTER TABLE "nursing_documentation_sheet" ADD COLUMN "treatment_date" date;--> statement-breakpoint
ALTER TABLE "nursing_documentation_sheet" ADD COLUMN "infusion_start_time" time;--> statement-breakpoint
ALTER TABLE "nursing_documentation_sheet" ADD COLUMN "infusion_end_time" time;--> statement-breakpoint
ALTER TABLE "nursing_documentation_sheet" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "nursing_documentation_sheet" ADD COLUMN "next_appointment_date" date;