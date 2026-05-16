CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text,
	"email" text,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "book_suggestions" CASCADE;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "contacts" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "telegram_username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "auth_provider" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_sign_in_at" timestamp;--> statement-breakpoint
UPDATE "user" u
SET "auth_provider" = CASE
	WHEN u."id" LIKE 'telegram:%' THEN 'telegram-preauth'
	WHEN EXISTS (
		SELECT 1 FROM "account" a
		WHERE a."userId" = u."id" AND a."provider" = 'google'
	) THEN 'google'
	ELSE 'email'
END
WHERE u."auth_provider" IS NULL;--> statement-breakpoint
UPDATE "user"
SET "last_sign_in_at" = "emailVerified"
WHERE "emailVerified" IS NOT NULL AND "last_sign_in_at" IS NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
