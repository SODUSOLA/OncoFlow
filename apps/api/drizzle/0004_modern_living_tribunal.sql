ALTER TABLE "meeting" DROP CONSTRAINT "meeting_transcript_finalized_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "transcript_corrected_at" timestamp;--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "transcript_corrected_by" uuid;--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "transcript_signed_off_at" timestamp;--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "transcript_signed_off_by" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meeting" ADD CONSTRAINT "meeting_transcript_corrected_by_user_id_fk" FOREIGN KEY ("transcript_corrected_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meeting" ADD CONSTRAINT "meeting_transcript_signed_off_by_user_id_fk" FOREIGN KEY ("transcript_signed_off_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "meeting" DROP COLUMN IF EXISTS "transcript_finalized_at";--> statement-breakpoint
ALTER TABLE "meeting" DROP COLUMN IF EXISTS "transcript_finalized_by";