CREATE TYPE "public"."public_inquiry_message_sender_type" AS ENUM('VISITOR', 'STAFF');--> statement-breakpoint
CREATE TYPE "public"."public_inquiry_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_registration_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"dob" date NOT NULL,
	"phone" varchar(32) NOT NULL,
	"preferred_facility_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "public_inquiry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_token_hash" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(32),
	"status" "public_inquiry_status" DEFAULT 'OPEN' NOT NULL,
	"linked_patient_id" uuid,
	"assigned_to" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "public_inquiry_access_token_hash_unique" UNIQUE("access_token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "public_inquiry_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"sender_type" "public_inquiry_message_sender_type" NOT NULL,
	"sender_user_id" uuid,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "patient_registration_request" ADD CONSTRAINT "patient_registration_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "patient_registration_request" ADD CONSTRAINT "patient_registration_request_preferred_facility_id_facility_id_fk" FOREIGN KEY ("preferred_facility_id") REFERENCES "public"."facility"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "public_inquiry" ADD CONSTRAINT "public_inquiry_linked_patient_id_patient_id_fk" FOREIGN KEY ("linked_patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "public_inquiry" ADD CONSTRAINT "public_inquiry_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "public_inquiry_message" ADD CONSTRAINT "public_inquiry_message_inquiry_id_public_inquiry_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."public_inquiry"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "public_inquiry_message" ADD CONSTRAINT "public_inquiry_message_sender_user_id_user_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "patient_registration_request_user_id_unique" ON "patient_registration_request" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_inquiry_status_updated_idx" ON "public_inquiry" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_inquiry_message_inquiry_idx" ON "public_inquiry_message" USING btree ("inquiry_id","created_at");