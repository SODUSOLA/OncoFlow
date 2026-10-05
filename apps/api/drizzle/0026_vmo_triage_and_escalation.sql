CREATE TYPE "public"."specialist_escalation_status" AS ENUM('NOTIFIED', 'CONSULT_SCHEDULED', 'RESOLVED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "specialist_escalation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"escalated_by" uuid NOT NULL,
	"conversation_id" uuid,
	"triage_session_id" uuid,
	"trigger_reason" text NOT NULL,
	"trigger_reference" uuid,
	"status" "specialist_escalation_status" DEFAULT 'NOTIFIED' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "triage_answer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"triage_session_id" uuid NOT NULL,
	"triage_question_id" uuid NOT NULL,
	"answer" boolean NOT NULL,
	"answered_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "triage_question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position" integer NOT NULL,
	"prompt" text NOT NULL,
	"impact_context" text NOT NULL,
	"affirmative_label" text DEFAULT 'Yes' NOT NULL,
	"negative_label" text DEFAULT 'No' NOT NULL,
	"protocol_reference" text NOT NULL,
	"differential_diagnosis" text NOT NULL,
	"required_evidence" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "triage_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"vmo_id" uuid NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "specialist_escalation" ADD CONSTRAINT "specialist_escalation_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "specialist_escalation" ADD CONSTRAINT "specialist_escalation_escalated_by_user_id_fk" FOREIGN KEY ("escalated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "specialist_escalation" ADD CONSTRAINT "specialist_escalation_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "specialist_escalation" ADD CONSTRAINT "specialist_escalation_triage_session_id_triage_session_id_fk" FOREIGN KEY ("triage_session_id") REFERENCES "public"."triage_session"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "triage_answer" ADD CONSTRAINT "triage_answer_triage_session_id_triage_session_id_fk" FOREIGN KEY ("triage_session_id") REFERENCES "public"."triage_session"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "triage_answer" ADD CONSTRAINT "triage_answer_triage_question_id_triage_question_id_fk" FOREIGN KEY ("triage_question_id") REFERENCES "public"."triage_question"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "triage_session" ADD CONSTRAINT "triage_session_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "triage_session" ADD CONSTRAINT "triage_session_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "triage_session" ADD CONSTRAINT "triage_session_vmo_id_user_id_fk" FOREIGN KEY ("vmo_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "specialist_escalation_patient_idx" ON "specialist_escalation" USING btree ("patient_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "triage_answer_session_question_unique" ON "triage_answer" USING btree ("triage_session_id","triage_question_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "triage_question_active_position_unique" ON "triage_question" USING btree ("position") WHERE "triage_question"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "triage_session_conversation_vmo_unique" ON "triage_session" USING btree ("conversation_id","vmo_id");