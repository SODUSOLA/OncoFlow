ALTER TABLE "medical_record" ADD COLUMN "source_meeting_id" uuid;--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "ended_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "medical_record" ADD CONSTRAINT "medical_record_source_meeting_id_meeting_id_fk" FOREIGN KEY ("source_meeting_id") REFERENCES "public"."meeting"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
