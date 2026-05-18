ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "is_admin" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "telegram_preauth_tokens" (
  "token_hash" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "telegram_preauth_tokens" ADD CONSTRAINT "telegram_preauth_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "telegram_preauth_tokens_user_id_idx" ON "telegram_preauth_tokens" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "telegram_preauth_tokens_expires_at_idx" ON "telegram_preauth_tokens" USING btree ("expires_at");
