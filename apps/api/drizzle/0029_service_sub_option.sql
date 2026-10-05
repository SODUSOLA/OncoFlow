CREATE TABLE IF NOT EXISTS "service_sub_option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classification_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "sub_option_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_sub_option" ADD CONSTRAINT "service_sub_option_classification_id_service_classification_id_fk" FOREIGN KEY ("classification_id") REFERENCES "public"."service_classification"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "service_sub_option_classification_code_unique" ON "service_sub_option" USING btree ("classification_id","code");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice" ADD CONSTRAINT "invoice_sub_option_id_service_sub_option_id_fk" FOREIGN KEY ("sub_option_id") REFERENCES "public"."service_sub_option"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
