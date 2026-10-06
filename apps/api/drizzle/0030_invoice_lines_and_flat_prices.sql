CREATE TABLE IF NOT EXISTS "invoice_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"classification_id" uuid NOT NULL,
	"sub_option_id" uuid NOT NULL,
	"description" varchar(255) NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_line_drug" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_line_id" uuid NOT NULL,
	"drug_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_sub_option_price" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_option_id" uuid NOT NULL,
	"is_subscriber" boolean NOT NULL,
	"medication_kobo" bigint DEFAULT 0 NOT NULL,
	"consumables_kobo" bigint DEFAULT 0 NOT NULL,
	"administration_kobo" bigint DEFAULT 0 NOT NULL,
	"professional_fee_kobo" bigint DEFAULT 0 NOT NULL,
	"network_fee_kobo" bigint DEFAULT 0 NOT NULL,
	"facility_fee_kobo" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice" DROP CONSTRAINT "invoice_sub_option_id_service_sub_option_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_classification_id_service_classification_id_fk" FOREIGN KEY ("classification_id") REFERENCES "public"."service_classification"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_sub_option_id_service_sub_option_id_fk" FOREIGN KEY ("sub_option_id") REFERENCES "public"."service_sub_option"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_line_drug" ADD CONSTRAINT "invoice_line_drug_invoice_line_id_invoice_line_id_fk" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."invoice_line"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_line_drug" ADD CONSTRAINT "invoice_line_drug_drug_id_drug_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."drug"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_sub_option_price" ADD CONSTRAINT "service_sub_option_price_sub_option_id_service_sub_option_id_fk" FOREIGN KEY ("sub_option_id") REFERENCES "public"."service_sub_option"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_line_invoice_idx" ON "invoice_line" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_line_drug_unique" ON "invoice_line_drug" USING btree ("invoice_line_id","drug_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "service_sub_option_price_tier_unique" ON "service_sub_option_price" USING btree ("sub_option_id","is_subscriber");--> statement-breakpoint
ALTER TABLE "invoice" DROP COLUMN IF EXISTS "sub_option_id";