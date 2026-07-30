CREATE TYPE "public"."transcription_assignment_status" AS ENUM('QUEUED', 'CLAIMED', 'IN_PROGRESS', 'COMPLETED', 'RELEASED');--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE 'SCRIBE' BEFORE 'SUPER_ADMIN';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transcription_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"scribe_id" uuid,
	"status" "transcription_assignment_status" DEFAULT 'QUEUED' NOT NULL,
	"queued_at" timestamp DEFAULT now() NOT NULL,
	"claimed_at" timestamp,
	"completed_at" timestamp,
	"sla_deadline" timestamp,
	"sla_breached" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "transcript_finalized_at" timestamp;--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "transcript_finalized_by" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transcription_assignment" ADD CONSTRAINT "transcription_assignment_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transcription_assignment" ADD CONSTRAINT "transcription_assignment_scribe_id_user_id_fk" FOREIGN KEY ("scribe_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transcription_assignment_meeting_id_unique" ON "transcription_assignment" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transcription_assignment_scribe_status_idx" ON "transcription_assignment" USING btree ("scribe_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transcription_assignment_sla_idx" ON "transcription_assignment" USING btree ("sla_deadline");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meeting" ADD CONSTRAINT "meeting_transcript_finalized_by_user_id_fk" FOREIGN KEY ("transcript_finalized_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
