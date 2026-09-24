ALTER TABLE "user" ADD COLUMN "profile_picture_file_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user" ADD CONSTRAINT "user_profile_picture_file_id_file_id_fk" FOREIGN KEY ("profile_picture_file_id") REFERENCES "public"."file"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
