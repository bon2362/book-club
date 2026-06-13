CREATE TABLE IF NOT EXISTS "telegram_login_failures" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"skew_seconds" integer,
	"tg_id" text,
	"tg_username" text,
	"has_hash" boolean NOT NULL,
	"ip" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telegram_login_failures_created_at_idx" ON "telegram_login_failures" ("created_at");
