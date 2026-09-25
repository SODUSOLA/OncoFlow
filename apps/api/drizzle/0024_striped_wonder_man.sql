CREATE TYPE "public"."nursing_case_event_type" AS ENUM('CASE_STARTED', 'IDENTITY_VERIFIED', 'IDENTITY_MISMATCH_REPORTED', 'INFUSION_STARTED', 'INFUSION_ENDED', 'SUBMITTED_FOR_QA', 'SENT_BACK_BY_QA', 'CLOSED_BY_QA');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nursing_case_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nursing_case_id" uuid NOT NULL,
	"event_type" "nursing_case_event_type" NOT NULL,
	"actor_id" uuid NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nursing_case" ADD COLUMN "infusion_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "nursing_case" ADD COLUMN "infusion_ended_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nursing_case_event" ADD CONSTRAINT "nursing_case_event_nursing_case_id_nursing_case_id_fk" FOREIGN KEY ("nursing_case_id") REFERENCES "public"."nursing_case"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nursing_case_event" ADD CONSTRAINT "nursing_case_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nursing_case_event_case_idx" ON "nursing_case_event" USING btree ("nursing_case_id","occurred_at");