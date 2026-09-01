CREATE TYPE "public"."conversation_feedback_rater_role" AS ENUM('PATIENT', 'STAFF');--> statement-breakpoint
ALTER TYPE "public"."service_classification_name" ADD VALUE 'SIDE_EFFECT_REPORT';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"rater_id" uuid NOT NULL,
	"rater_role" "conversation_feedback_rater_role" NOT NULL,
	"rating" smallint NOT NULL,
	"review" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tariff" ADD COLUMN "professional_fee_kobo" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_feedback" ADD CONSTRAINT "conversation_feedback_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_feedback" ADD CONSTRAINT "conversation_feedback_rater_id_user_id_fk" FOREIGN KEY ("rater_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_feedback_conversation_rater_unique" ON "conversation_feedback" USING btree ("conversation_id","rater_id");