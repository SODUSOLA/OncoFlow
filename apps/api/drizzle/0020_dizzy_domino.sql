ALTER TABLE "user" ADD COLUMN "first_name" varchar(128);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_name" varchar(128);--> statement-breakpoint
ALTER TABLE "regimen" ADD COLUMN "diagnosis" text;--> statement-breakpoint
ALTER TABLE "regimen" ADD COLUMN "prescribed_by" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "regimen" ADD CONSTRAINT "regimen_prescribed_by_user_id_fk" FOREIGN KEY ("prescribed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
