ALTER TABLE "user" ADD COLUMN "email_verified_at" timestamp;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_verification_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_verification_token" ADD CONSTRAINT "email_verification_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_verification_token_hash_idx" ON "email_verification_token" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_verification_token_user_idx" ON "email_verification_token" USING btree ("user_id");
