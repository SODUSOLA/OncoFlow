CREATE TYPE "public"."account_lock_type" AS ENUM('24H_ADMIN', 'MISCONDUCT');--> statement-breakpoint
CREATE TYPE "public"."appointment_card_status" AS ENUM('DRAFT', 'SUBMITTED', 'REVIEWED_BY_QA');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'MISSED');--> statement-breakpoint
CREATE TYPE "public"."appointment_type" AS ENUM('VIRTUAL', 'PHYSICAL', 'CHEMOTHERAPY', 'PROCEDURE');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'APPROVE', 'DECLINE', 'ACCESS_DENIED');--> statement-breakpoint
CREATE TYPE "public"."audit_result" AS ENUM('ALLOWED', 'DENIED');--> statement-breakpoint
CREATE TYPE "public"."billing_cycle" AS ENUM('MONTHLY', 'YEARLY');--> statement-breakpoint
CREATE TYPE "public"."decision_type" AS ENUM('APPROVED', 'DECLINED', 'REQUIRES_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."conversation_type" AS ENUM('ADMIN_INQUIRY', 'MO_SIDE_EFFECT');--> statement-breakpoint
CREATE TYPE "public"."countdown_status" AS ENUM('ACTIVE', 'ESCALATED', 'CLEARED', 'DECLINED');--> statement-breakpoint
CREATE TYPE "public"."facility_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."incident_type" AS ENUM('BROKEN', 'SPILLED', 'EXPIRED', 'MANUFACTURING_DEFECT');--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_type" AS ENUM('PURCHASE', 'DISPATCH', 'RECEIPT_CONFIRMED', 'ADMINISTERED', 'INCIDENT', 'RETURN', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."invoice_component" AS ENUM('NETWORK_FEE', 'FACILITY_FEE', 'PROFESSIONAL_FEE', 'DRUG_COST');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('DRAFT', 'SENT', 'PAID', 'VOID', 'OVERDUE');--> statement-breakpoint
CREATE TYPE "public"."lab_request_status" AS ENUM('PENDING', 'UPLOADED', 'REVIEWED');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('SCHEDULED', 'IN_PROGRESS', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('SENT', 'DELIVERED', 'READ');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('TEXT', 'IMAGE', 'VOICE', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."misconduct_status" AS ENUM('OPEN', 'UNDER_REVIEW', 'CLEARED');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('PENDING', 'SENT', 'READ', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."patient_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."payee_owner_type" AS ENUM('FACILITY', 'USER');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."payout_role" AS ENUM('ONCOLOGIST', 'STATE_CLINICAL_DIRECTOR', 'NATIONAL_CLINICAL_DIRECTOR', 'STATE_DIRECTOR_OF_NURSING_SERVICES', 'NATIONAL_DIRECTOR_OF_NURSING_SERVICES');--> statement-breakpoint
CREATE TYPE "public"."payout_source_type" AS ENUM('PROFESSIONAL_FEE_SPLIT', 'FACILITY_FEE');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."physical_case_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."physical_case_type" AS ENUM('INFUSION', 'CONSULTATION');--> statement-breakpoint
CREATE TYPE "public"."prescription_status" AS ENUM('ACTIVE', 'FULFILLED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_status" AS ENUM('PENDING', 'VARIANCE_FLAGGED', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."role_name" AS ENUM('PATIENT', 'REGIONAL_ADMIN', 'VIRTUAL_MEDICAL_OFFICER', 'CONSULTING_ONCOLOGIST', 'STATE_CLINICAL_DIRECTOR', 'QUALITY_ASSURANCE_OFFICER', 'ONSITE_NURSING_OFFICER', 'NATIONAL_CLINICAL_DIRECTOR', 'STATE_DIRECTOR_OF_NURSING_SERVICES', 'NATIONAL_DIRECTOR_OF_NURSING_SERVICES', 'SUPER_ADMIN');--> statement-breakpoint
CREATE TYPE "public"."service_classification_name" AS ENUM('SUBSCRIPTION', 'CONSULTATION', 'DRUG_ADMINISTRATION', 'CHEMOTHERAPY', 'GENERAL_ADMISSION', 'PROCEDURE');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('ACTIVE', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('PENDING', 'APPROVED', 'DECLINED');--> statement-breakpoint
CREATE TYPE "public"."treatment_status" AS ENUM('PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'INACTIVE', 'LOCKED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."virus_scan_status" AS ENUM('PENDING', 'CLEAN', 'INFECTED');--> statement-breakpoint
CREATE TYPE "public"."wallet_transaction_type" AS ENUM('CREDIT', 'DEBIT');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_lock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"locked_by" uuid NOT NULL,
	"locked_at" timestamp NOT NULL,
	"locked_until" timestamp,
	"reason" text NOT NULL,
	"lock_type" "account_lock_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "misconduct_flag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flagged_user_id" uuid NOT NULL,
	"trigger_reason" text NOT NULL,
	"conversation_id" uuid,
	"status" "misconduct_status" DEFAULT 'OPEN' NOT NULL,
	"reviewer_1_id" uuid,
	"reviewer_2_id" uuid,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "permission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource" varchar(255) NOT NULL,
	"action" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" "role_name" NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "role_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_permission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device" varchar(255) NOT NULL,
	"ip" varchar(64) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"mfa_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"last_login" timestamp,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "department" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "facility" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"region" varchar(100) NOT NULL,
	"address" text NOT NULL,
	"status" "facility_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "emergency_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"relationship" varchar(100) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unique_patient_id" varchar(32) NOT NULL,
	"user_id" uuid,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"dob" date NOT NULL,
	"gender" varchar(32) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"email" varchar(255) NOT NULL,
	"status" "patient_status" DEFAULT 'ACTIVE' NOT NULL,
	"facility_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_address" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"country" varchar(100) NOT NULL,
	"state" varchar(100) NOT NULL,
	"city" varchar(100) NOT NULL,
	"address" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_timeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"reference_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"balance_kobo" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appointment_card" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"physical_case_id" uuid NOT NULL,
	"filled_by" uuid NOT NULL,
	"filled_at" timestamp,
	"vitals_summary" text NOT NULL,
	"notes" text NOT NULL,
	"status" "appointment_card_status" DEFAULT 'DRAFT' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appointment_card_checklist_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_card_id" uuid NOT NULL,
	"item_name" varchar(255) NOT NULL,
	"is_checked" boolean DEFAULT false NOT NULL,
	"checked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clinical_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lab_result_id" uuid NOT NULL,
	"qa_recommendation" "decision_type",
	"qa_reason" text,
	"qa_decided_by" uuid,
	"qa_decided_at" timestamp,
	"final_decision" "decision_type",
	"final_reason" text,
	"director_id" uuid,
	"director_decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clinical_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medical_record_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "countdown_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"current_day" integer NOT NULL,
	"status" "countdown_status" DEFAULT 'ACTIVE' NOT NULL,
	"labs_prompted_at" timestamp,
	"labs_uploaded_at" timestamp,
	"results_sent_to_qa_at" timestamp,
	"clinical_decision_id" uuid,
	"invoice_id" uuid,
	"payment_confirmed_at" timestamp,
	"reminder_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lab_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" "lab_request_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lab_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"status" "lab_request_status" DEFAULT 'PENDING' NOT NULL,
	"file_id" uuid NOT NULL,
	"test_date" date NOT NULL,
	"file_hash" varchar(128) NOT NULL,
	"possible_duplicate" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "medical_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"record_type" varchar(100) NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "physical_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"countdown_case_id" uuid,
	"appointment_id" uuid NOT NULL,
	"opened_by" uuid NOT NULL,
	"opened_at" timestamp,
	"case_type" "physical_case_type" NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp,
	"status" "physical_case_status" DEFAULT 'OPEN' NOT NULL,
	"doctor_note_reviewed_at" timestamp,
	"appointment_card_reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prescription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"appointment_id" uuid,
	"triage_checklist_id" uuid,
	"status" "prescription_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "treatment_cycle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"cycle_number" integer NOT NULL,
	"status" "treatment_status" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "treatment_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"oncologist_id" uuid NOT NULL,
	"clinical_director_id" uuid NOT NULL,
	"status" "treatment_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "triage_checklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"completed_by" uuid NOT NULL,
	"completed_at" timestamp NOT NULL,
	"presenting_complaint" text NOT NULL,
	"duration" varchar(100) NOT NULL,
	"functional_impact" text NOT NULL,
	"prior_measures" text NOT NULL,
	"can_talk_walk_eat" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appointment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"oncologist_id" uuid,
	"facility_id" uuid NOT NULL,
	"appointment_type" "appointment_type" NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"status" "appointment_status" DEFAULT 'PENDING' NOT NULL,
	"meeting_id" uuid,
	"payment_confirmed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appointment_participant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transfer_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"from_facility_id" uuid NOT NULL,
	"to_facility_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"approved_by" uuid,
	"status" "transfer_status" DEFAULT 'PENDING' NOT NULL,
	"routed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"conversation_type" "conversation_type" NOT NULL,
	"status" "conversation_status" DEFAULT 'OPEN' NOT NULL,
	"sla_deadline" timestamp,
	"first_response_at" timestamp,
	"sla_breached" boolean DEFAULT false NOT NULL,
	"assigned_to" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meeting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"provider" varchar(100) NOT NULL,
	"room_id" varchar(255) NOT NULL,
	"status" "meeting_status" DEFAULT 'SCHEDULED' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"type" "message_type" NOT NULL,
	"content" text NOT NULL,
	"status" "message_status" DEFAULT 'SENT' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "participant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transcript" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"speaker" varchar(100) NOT NULL,
	"content" text NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"appointment_id" uuid,
	"facility_id" uuid NOT NULL,
	"classification_id" uuid NOT NULL,
	"status" "invoice_status" DEFAULT 'DRAFT' NOT NULL,
	"total_kobo" bigint NOT NULL,
	"issued_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"component" "invoice_component" NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payee_bank_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" "payee_owner_type" NOT NULL,
	"owner_id" uuid NOT NULL,
	"bank_code" varchar(20) NOT NULL,
	"account_number" varchar(20) NOT NULL,
	"account_name" varchar(255) NOT NULL,
	"verified_at" timestamp,
	"verification_reference" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"gateway" varchar(50) NOT NULL,
	"reference" varchar(255) NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_reference" varchar(255) NOT NULL,
	"payee_type" "payee_owner_type" NOT NULL,
	"payee_id" uuid NOT NULL,
	"payee_account_id" uuid NOT NULL,
	"total_amount_kobo" bigint NOT NULL,
	"status" "payout_status" DEFAULT 'PENDING' NOT NULL,
	"monnify_transfer_reference" varchar(255),
	"initiated_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payout_line_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payout_id" uuid NOT NULL,
	"source_type" "payout_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payout_line_item_source_id_unique" UNIQUE("source_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "professional_fee_split" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"role" "payout_role" NOT NULL,
	"recipient_id" uuid NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"is_out_of_state" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_classification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" "service_classification_name" NOT NULL,
	"capped_network_fee_kobo" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_classification_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"billing_cycle" "billing_cycle" NOT NULL,
	"status" "subscription_status" DEFAULT 'ACTIVE' NOT NULL,
	"next_billing_date" date NOT NULL,
	"started_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tariff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"classification_id" uuid NOT NULL,
	"network_fee_kobo" bigint NOT NULL,
	"facility_bed_fee_kobo" bigint NOT NULL,
	"drug_price_kobo" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"payment_id" uuid,
	"type" "wallet_transaction_type" NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drug" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"strength" varchar(100) NOT NULL,
	"category" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid,
	"drug_id" uuid NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_movement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_id" uuid NOT NULL,
	"movement_type" "inventory_movement_type" NOT NULL,
	"quantity" integer NOT NULL,
	"performed_by" uuid NOT NULL,
	"reference_id" uuid,
	"evidence_file_id" uuid,
	"incident_type" "incident_type",
	"dispatch_reference" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reconciliation_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"week_ending" date NOT NULL,
	"expected_qty" integer NOT NULL,
	"actual_qty" integer NOT NULL,
	"variance" integer NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp,
	"status" "reconciliation_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid,
	"uploaded_by" uuid NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"virus_scan_status" "virus_scan_status" DEFAULT 'PENDING' NOT NULL,
	"file_hash" varchar(128) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "file_verification_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"step_name" varchar(255) NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"type" varchar(100) NOT NULL,
	"status" "notification_status" DEFAULT 'PENDING' NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" "audit_action" NOT NULL,
	"resource" varchar(255) NOT NULL,
	"resource_id" uuid,
	"result" "audit_result" NOT NULL,
	"ip" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account_lock" ADD CONSTRAINT "account_lock_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account_lock" ADD CONSTRAINT "account_lock_locked_by_user_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "misconduct_flag" ADD CONSTRAINT "misconduct_flag_flagged_user_id_user_id_fk" FOREIGN KEY ("flagged_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "misconduct_flag" ADD CONSTRAINT "misconduct_flag_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "misconduct_flag" ADD CONSTRAINT "misconduct_flag_reviewer_1_id_user_id_fk" FOREIGN KEY ("reviewer_1_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "misconduct_flag" ADD CONSTRAINT "misconduct_flag_reviewer_2_id_user_id_fk" FOREIGN KEY ("reviewer_2_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permission"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "department" ADD CONSTRAINT "department_facility_id_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facility"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "emergency_contact" ADD CONSTRAINT "emergency_contact_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "patient" ADD CONSTRAINT "patient_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "patient" ADD CONSTRAINT "patient_facility_id_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facility"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "patient_address" ADD CONSTRAINT "patient_address_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "patient_timeline" ADD CONSTRAINT "patient_timeline_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallet" ADD CONSTRAINT "wallet_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointment_card" ADD CONSTRAINT "appointment_card_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointment_card" ADD CONSTRAINT "appointment_card_physical_case_id_physical_case_id_fk" FOREIGN KEY ("physical_case_id") REFERENCES "public"."physical_case"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointment_card" ADD CONSTRAINT "appointment_card_filled_by_user_id_fk" FOREIGN KEY ("filled_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointment_card" ADD CONSTRAINT "appointment_card_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointment_card_checklist_item" ADD CONSTRAINT "appointment_card_checklist_item_appointment_card_id_appointment_card_id_fk" FOREIGN KEY ("appointment_card_id") REFERENCES "public"."appointment_card"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clinical_decision" ADD CONSTRAINT "clinical_decision_lab_result_id_lab_result_id_fk" FOREIGN KEY ("lab_result_id") REFERENCES "public"."lab_result"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clinical_decision" ADD CONSTRAINT "clinical_decision_qa_decided_by_user_id_fk" FOREIGN KEY ("qa_decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clinical_decision" ADD CONSTRAINT "clinical_decision_director_id_user_id_fk" FOREIGN KEY ("director_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clinical_note" ADD CONSTRAINT "clinical_note_medical_record_id_medical_record_id_fk" FOREIGN KEY ("medical_record_id") REFERENCES "public"."medical_record"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clinical_note" ADD CONSTRAINT "clinical_note_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "countdown_case" ADD CONSTRAINT "countdown_case_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "countdown_case" ADD CONSTRAINT "countdown_case_clinical_decision_id_clinical_decision_id_fk" FOREIGN KEY ("clinical_decision_id") REFERENCES "public"."clinical_decision"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "countdown_case" ADD CONSTRAINT "countdown_case_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lab_request" ADD CONSTRAINT "lab_request_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lab_request" ADD CONSTRAINT "lab_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lab_result" ADD CONSTRAINT "lab_result_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lab_result" ADD CONSTRAINT "lab_result_request_id_lab_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."lab_request"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lab_result" ADD CONSTRAINT "lab_result_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lab_result" ADD CONSTRAINT "lab_result_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lab_result" ADD CONSTRAINT "lab_result_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "medical_record" ADD CONSTRAINT "medical_record_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "medical_record" ADD CONSTRAINT "medical_record_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "physical_case" ADD CONSTRAINT "physical_case_countdown_case_id_countdown_case_id_fk" FOREIGN KEY ("countdown_case_id") REFERENCES "public"."countdown_case"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "physical_case" ADD CONSTRAINT "physical_case_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "physical_case" ADD CONSTRAINT "physical_case_opened_by_user_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "physical_case" ADD CONSTRAINT "physical_case_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prescription" ADD CONSTRAINT "prescription_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prescription" ADD CONSTRAINT "prescription_doctor_id_user_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prescription" ADD CONSTRAINT "prescription_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prescription" ADD CONSTRAINT "prescription_triage_checklist_id_triage_checklist_id_fk" FOREIGN KEY ("triage_checklist_id") REFERENCES "public"."triage_checklist"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treatment_cycle" ADD CONSTRAINT "treatment_cycle_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treatment_plan" ADD CONSTRAINT "treatment_plan_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treatment_plan" ADD CONSTRAINT "treatment_plan_oncologist_id_user_id_fk" FOREIGN KEY ("oncologist_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treatment_plan" ADD CONSTRAINT "treatment_plan_clinical_director_id_user_id_fk" FOREIGN KEY ("clinical_director_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "triage_checklist" ADD CONSTRAINT "triage_checklist_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "triage_checklist" ADD CONSTRAINT "triage_checklist_completed_by_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointment" ADD CONSTRAINT "appointment_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointment" ADD CONSTRAINT "appointment_oncologist_id_user_id_fk" FOREIGN KEY ("oncologist_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointment" ADD CONSTRAINT "appointment_facility_id_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facility"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointment_participant" ADD CONSTRAINT "appointment_participant_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointment_participant" ADD CONSTRAINT "appointment_participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfer_request" ADD CONSTRAINT "transfer_request_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfer_request" ADD CONSTRAINT "transfer_request_from_facility_id_facility_id_fk" FOREIGN KEY ("from_facility_id") REFERENCES "public"."facility"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfer_request" ADD CONSTRAINT "transfer_request_to_facility_id_facility_id_fk" FOREIGN KEY ("to_facility_id") REFERENCES "public"."facility"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfer_request" ADD CONSTRAINT "transfer_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfer_request" ADD CONSTRAINT "transfer_request_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation" ADD CONSTRAINT "conversation_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation" ADD CONSTRAINT "conversation_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meeting" ADD CONSTRAINT "meeting_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message" ADD CONSTRAINT "message_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "participant" ADD CONSTRAINT "participant_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "participant" ADD CONSTRAINT "participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transcript" ADD CONSTRAINT "transcript_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transcript" ADD CONSTRAINT "transcript_edited_by_user_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice" ADD CONSTRAINT "invoice_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice" ADD CONSTRAINT "invoice_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice" ADD CONSTRAINT "invoice_facility_id_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facility"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice" ADD CONSTRAINT "invoice_classification_id_service_classification_id_fk" FOREIGN KEY ("classification_id") REFERENCES "public"."service_classification"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_item" ADD CONSTRAINT "invoice_item_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment" ADD CONSTRAINT "payment_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payout" ADD CONSTRAINT "payout_payee_account_id_payee_bank_account_id_fk" FOREIGN KEY ("payee_account_id") REFERENCES "public"."payee_bank_account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payout_line_item" ADD CONSTRAINT "payout_line_item_payout_id_payout_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payout"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "professional_fee_split" ADD CONSTRAINT "professional_fee_split_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "professional_fee_split" ADD CONSTRAINT "professional_fee_split_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription" ADD CONSTRAINT "subscription_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tariff" ADD CONSTRAINT "tariff_facility_id_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facility"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tariff" ADD CONSTRAINT "tariff_classification_id_service_classification_id_fk" FOREIGN KEY ("classification_id") REFERENCES "public"."service_classification"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallet_transaction" ADD CONSTRAINT "wallet_transaction_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallet_transaction" ADD CONSTRAINT "wallet_transaction_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory" ADD CONSTRAINT "inventory_facility_id_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facility"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory" ADD CONSTRAINT "inventory_drug_id_drug_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."drug"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_inventory_id_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_performed_by_user_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_evidence_file_id_file_id_fk" FOREIGN KEY ("evidence_file_id") REFERENCES "public"."file"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reconciliation_record" ADD CONSTRAINT "reconciliation_record_facility_id_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facility"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reconciliation_record" ADD CONSTRAINT "reconciliation_record_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "file" ADD CONSTRAINT "file_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "file" ADD CONSTRAINT "file_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "file_verification_step" ADD CONSTRAINT "file_verification_step_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "file_verification_step" ADD CONSTRAINT "file_verification_step_verified_by_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_expires_at_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique_active" ON "user" USING btree ("email") WHERE "user"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_status_idx" ON "user" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_last_login_idx" ON "user" USING btree ("last_login");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_role_unique" ON "user_role" USING btree ("user_id","role_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "patient_unique_id_active" ON "patient" USING btree ("unique_patient_id") WHERE "patient"."is_deleted" = false;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "patient_user_id_unique" ON "patient" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "patient_facility_idx" ON "patient" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "patient_status_idx" ON "patient" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "patient_dob_idx" ON "patient" USING btree ("dob");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_patient_id_unique" ON "wallet" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "appointment_card_appointment_id_unique" ON "appointment_card" USING btree ("appointment_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "appointment_card_checklist_item_unique" ON "appointment_card_checklist_item" USING btree ("appointment_card_id","item_name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "clinical_decision_lab_result_id_unique" ON "clinical_decision" USING btree ("lab_result_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "countdown_case_patient_status_idx" ON "countdown_case" USING btree ("patient_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "countdown_case_current_day_idx" ON "countdown_case" USING btree ("current_day");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "countdown_case_invoice_id_unique" ON "countdown_case" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lab_result_file_hash_patient_test_date_idx" ON "lab_result" USING btree ("file_hash","patient_id","test_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "physical_case_countdown_case_id_unique" ON "physical_case" USING btree ("countdown_case_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "physical_case_appointment_id_unique" ON "physical_case" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "physical_case_status_idx" ON "physical_case" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "triage_checklist_conversation_id_unique" ON "triage_checklist" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointment_patient_idx" ON "appointment" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointment_facility_scheduled_idx" ON "appointment" USING btree ("facility_id","scheduled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointment_status_idx" ON "appointment" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_assigned_sla_idx" ON "conversation" USING btree ("assigned_to","sla_deadline");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_appointment_id_unique" ON "meeting" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_patient_idx" ON "invoice" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_status_idx" ON "invoice" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_issued_at_idx" ON "invoice" USING btree ("issued_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payee_bank_account_owner_idx" ON "payee_bank_account" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payout_payee_idx" ON "payout" USING btree ("payee_type","payee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payout_status_idx" ON "payout" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payout_batch_reference_idx" ON "payout" USING btree ("batch_reference");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payout_line_item_payout_idx" ON "payout_line_item" USING btree ("payout_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tariff_facility_classification_unique" ON "tariff" USING btree ("facility_id","classification_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "file_verification_step_unique" ON "file_verification_step" USING btree ("file_id","step_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_resource_id_idx" ON "audit_log" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_result_idx" ON "audit_log" USING btree ("result");