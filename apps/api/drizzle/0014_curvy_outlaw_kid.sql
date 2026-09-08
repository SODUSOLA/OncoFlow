CREATE TYPE "public"."egfr_stage" AS ENUM('G1', 'G2', 'G3A', 'G3B', 'G4', 'G5');--> statement-breakpoint
ALTER TYPE "public"."case_lock_trigger" ADD VALUE 'EGFR_CRITICAL' BEFORE 'QA_HOLD';--> statement-breakpoint
ALTER TABLE "clinical_metrics_snapshot" ADD COLUMN "egfr" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "clinical_metrics_snapshot" ADD COLUMN "egfr_stage" "egfr_stage" NOT NULL;