ALTER TABLE "nursing_documentation_sheet" ALTER COLUMN "id_photo_file_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "nursing_case" ADD COLUMN "identity_verified_at" timestamp;