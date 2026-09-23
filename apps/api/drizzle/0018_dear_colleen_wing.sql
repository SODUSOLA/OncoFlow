CREATE TYPE "public"."drug_dispatch_status" AS ENUM('IN_TRANSIT', 'DELIVERED');--> statement-breakpoint
CREATE TYPE "public"."drug_ledger_reason" AS ENUM('DELIVERY', 'USAGE', 'LOSS', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."drug_loss_reason" AS ENUM('SPILLAGE', 'BREAKAGE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."drug_reconciliation_scope" AS ENUM('REGIONAL', 'NURSING_OFFICER');--> statement-breakpoint
CREATE TYPE "public"."drug_request_status" AS ENUM('REQUESTED', 'DISPATCHED', 'DELIVERED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."regional_drug_ledger_reason" AS ENUM('PROCUREMENT', 'DISPATCH', 'ADJUSTMENT');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drug_dispatch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drug_request_id" uuid NOT NULL,
	"dispatched_by" uuid NOT NULL,
	"dispatched_at" timestamp DEFAULT now() NOT NULL,
	"status" "drug_dispatch_status" DEFAULT 'IN_TRANSIT' NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drug_dispatch_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drug_dispatch_id" uuid NOT NULL,
	"drug_id" uuid NOT NULL,
	"quantity_dispatched" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drug_loss_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nursing_officer_id" uuid NOT NULL,
	"drug_id" uuid NOT NULL,
	"quantity_lost" integer NOT NULL,
	"reason" "drug_loss_reason" NOT NULL,
	"notes" text,
	"reported_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drug_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"status" "drug_request_status" DEFAULT 'REQUESTED' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drug_request_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drug_request_id" uuid NOT NULL,
	"drug_id" uuid NOT NULL,
	"quantity_requested" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drug_stock_ledger_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nursing_officer_id" uuid NOT NULL,
	"drug_id" uuid NOT NULL,
	"quantity_delta" integer NOT NULL,
	"reason" "drug_ledger_reason" NOT NULL,
	"reference_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drug_stock_reconciliation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "drug_reconciliation_scope" NOT NULL,
	"nursing_officer_id" uuid,
	"drug_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"expected_quantity" integer NOT NULL,
	"counted_quantity" integer NOT NULL,
	"variance" integer NOT NULL,
	"counted_by" uuid NOT NULL,
	"counted_at" timestamp DEFAULT now() NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drug_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nursing_case_id" uuid NOT NULL,
	"drug_id" uuid NOT NULL,
	"administered_by" uuid NOT NULL,
	"quantity_used" integer NOT NULL,
	"used_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "regional_drug_stock_ledger_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drug_id" uuid NOT NULL,
	"quantity_delta" integer NOT NULL,
	"reason" "regional_drug_ledger_reason" NOT NULL,
	"reference_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drug" ADD COLUMN "reorder_threshold" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_dispatch" ADD CONSTRAINT "drug_dispatch_drug_request_id_drug_request_id_fk" FOREIGN KEY ("drug_request_id") REFERENCES "public"."drug_request"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_dispatch" ADD CONSTRAINT "drug_dispatch_dispatched_by_user_id_fk" FOREIGN KEY ("dispatched_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_dispatch" ADD CONSTRAINT "drug_dispatch_acknowledged_by_user_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_dispatch_line" ADD CONSTRAINT "drug_dispatch_line_drug_dispatch_id_drug_dispatch_id_fk" FOREIGN KEY ("drug_dispatch_id") REFERENCES "public"."drug_dispatch"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_dispatch_line" ADD CONSTRAINT "drug_dispatch_line_drug_id_drug_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."drug"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_loss_report" ADD CONSTRAINT "drug_loss_report_nursing_officer_id_user_id_fk" FOREIGN KEY ("nursing_officer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_loss_report" ADD CONSTRAINT "drug_loss_report_drug_id_drug_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."drug"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_request" ADD CONSTRAINT "drug_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_request" ADD CONSTRAINT "drug_request_facility_id_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facility"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_request_line" ADD CONSTRAINT "drug_request_line_drug_request_id_drug_request_id_fk" FOREIGN KEY ("drug_request_id") REFERENCES "public"."drug_request"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_request_line" ADD CONSTRAINT "drug_request_line_drug_id_drug_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."drug"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_stock_ledger_entry" ADD CONSTRAINT "drug_stock_ledger_entry_nursing_officer_id_user_id_fk" FOREIGN KEY ("nursing_officer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_stock_ledger_entry" ADD CONSTRAINT "drug_stock_ledger_entry_drug_id_drug_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."drug"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_stock_reconciliation" ADD CONSTRAINT "drug_stock_reconciliation_nursing_officer_id_user_id_fk" FOREIGN KEY ("nursing_officer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_stock_reconciliation" ADD CONSTRAINT "drug_stock_reconciliation_drug_id_drug_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."drug"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_stock_reconciliation" ADD CONSTRAINT "drug_stock_reconciliation_counted_by_user_id_fk" FOREIGN KEY ("counted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_stock_reconciliation" ADD CONSTRAINT "drug_stock_reconciliation_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_usage" ADD CONSTRAINT "drug_usage_nursing_case_id_nursing_case_id_fk" FOREIGN KEY ("nursing_case_id") REFERENCES "public"."nursing_case"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_usage" ADD CONSTRAINT "drug_usage_drug_id_drug_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."drug"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drug_usage" ADD CONSTRAINT "drug_usage_administered_by_user_id_fk" FOREIGN KEY ("administered_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "regional_drug_stock_ledger_entry" ADD CONSTRAINT "regional_drug_stock_ledger_entry_drug_id_drug_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."drug"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drug_request_facility_status_idx" ON "drug_request" USING btree ("facility_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drug_stock_ledger_officer_drug_idx" ON "drug_stock_ledger_entry" USING btree ("nursing_officer_id","drug_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regional_drug_ledger_drug_idx" ON "regional_drug_stock_ledger_entry" USING btree ("drug_id");
--> statement-breakpoint
-- Opening balance: carries the existing regional pool counter (facility_id IS NULL) into the new regional ledger, so no stock disappears.
INSERT INTO "regional_drug_stock_ledger_entry" ("drug_id", "quantity_delta", "reason")
SELECT "drug_id", "quantity", 'ADJUSTMENT' FROM "inventory" WHERE "facility_id" IS NULL AND "quantity" <> 0;
