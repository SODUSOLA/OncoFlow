CREATE TYPE "public"."meeting_recording_status" AS ENUM('PROCESSING', 'AVAILABLE', 'FAILED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meeting_recording" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"daily_recording_id" varchar(255) NOT NULL,
	"download_url" text,
	"duration_seconds" integer,
	"status" "meeting_recording_status" DEFAULT 'PROCESSING' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consultant_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consultant_id" uuid NOT NULL,
	"available_date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "daily_room_exp" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meeting_recording" ADD CONSTRAINT "meeting_recording_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consultant_availability" ADD CONSTRAINT "consultant_availability_consultant_id_user_id_fk" FOREIGN KEY ("consultant_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_recording_daily_id_unique" ON "meeting_recording" USING btree ("daily_recording_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consultant_availability_consultant_date_idx" ON "consultant_availability" USING btree ("consultant_id","available_date");