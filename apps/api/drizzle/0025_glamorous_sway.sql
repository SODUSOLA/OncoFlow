ALTER TYPE "public"."drug_loss_reason" ADD VALUE 'SPOILAGE';--> statement-breakpoint
ALTER TYPE "public"."drug_loss_reason" ADD VALUE 'EXPIRY';--> statement-breakpoint
ALTER TYPE "public"."drug_loss_reason" ADD VALUE 'WASTAGE';--> statement-breakpoint
ALTER TABLE "drug_loss_report" ADD COLUMN "photo_file_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_loss_report" ADD CONSTRAINT "drug_loss_report_photo_file_id_file_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."file"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
