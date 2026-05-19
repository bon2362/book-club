ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "last_activity_at" timestamp;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_activity_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"source" text,
	"source_id" text,
	"dedupe_key" text,
	"metadata" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_activity_events" ADD CONSTRAINT "user_activity_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_activity_events_user_id_occurred_at_idx" ON "user_activity_events" USING btree ("user_id","occurred_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_activity_events_dedupe_key_idx" ON "user_activity_events" USING btree ("dedupe_key");
--> statement-breakpoint
INSERT INTO "user_activity_events" (
	"id",
	"user_id",
	"type",
	"occurred_at",
	"source",
	"source_id",
	"dedupe_key",
	"metadata"
)
SELECT
	concat('backfill:user:last_sign_in_at:', u."id"),
	u."id",
	'sign_in',
	u."last_sign_in_at",
	'user',
	concat('last_sign_in_at:', u."id"),
	concat('backfill:user:last_sign_in_at:', u."id"),
	json_build_object('sourceColumn', 'last_sign_in_at')::text
FROM "user" u
WHERE u."last_sign_in_at" IS NOT NULL
ON CONFLICT ("dedupe_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "user_activity_events" (
	"id",
	"user_id",
	"type",
	"occurred_at",
	"source",
	"source_id",
	"dedupe_key",
	"metadata"
)
SELECT
	concat('backfill:signup_books:', sb."user_id", ':', md5(sb."book_name")),
	sb."user_id",
	'books_selected',
	sb."signed_at",
	'signup_books',
	concat(sb."user_id", ':', md5(sb."book_name")),
	concat('backfill:signup_books:', sb."user_id", ':', md5(sb."book_name")),
	json_build_object('bookName', sb."book_name")::text
FROM "signup_books" sb
ON CONFLICT ("dedupe_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "user_activity_events" (
	"id",
	"user_id",
	"type",
	"occurred_at",
	"source",
	"source_id",
	"dedupe_key",
	"metadata"
)
SELECT
	concat('backfill:book_priorities:', bp."user_id", ':', md5(bp."book_name")),
	bp."user_id",
	'priorities_updated',
	bp."updated_at",
	'book_priorities',
	concat(bp."user_id", ':', md5(bp."book_name")),
	concat('backfill:book_priorities:', bp."user_id", ':', md5(bp."book_name")),
	json_build_object('bookName', bp."book_name", 'rank', bp."rank")::text
FROM "book_priorities" bp
ON CONFLICT ("dedupe_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "user_activity_events" (
	"id",
	"user_id",
	"type",
	"occurred_at",
	"source",
	"source_id",
	"dedupe_key",
	"metadata"
)
SELECT
	concat('backfill:book_submissions:', bs."id"),
	bs."user_id",
	'submission_created',
	bs."created_at",
	'book_submissions',
	bs."id",
	concat('backfill:book_submissions:', bs."id"),
	json_build_object('title', bs."title", 'author', bs."author")::text
FROM "book_submissions" bs
ON CONFLICT ("dedupe_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "user_activity_events" (
	"id",
	"user_id",
	"type",
	"occurred_at",
	"source",
	"source_id",
	"dedupe_key",
	"metadata"
)
SELECT
	concat('backfill:feedback:', f."id"),
	f."user_id",
	'feedback_created',
	f."created_at",
	'feedback',
	f."id",
	concat('backfill:feedback:', f."id"),
	json_build_object('hasEmail', f."email" IS NOT NULL, 'hasName', f."name" IS NOT NULL)::text
FROM "feedback" f
WHERE f."user_id" IS NOT NULL
ON CONFLICT ("dedupe_key") DO NOTHING;
--> statement-breakpoint
WITH latest_activity AS (
	SELECT
		"user_id",
		max("occurred_at") AS "occurred_at"
	FROM "user_activity_events"
	GROUP BY "user_id"
)
UPDATE "user" u
SET "last_activity_at" = CASE
	WHEN u."last_activity_at" IS NULL OR u."last_activity_at" < latest_activity."occurred_at"
		THEN latest_activity."occurred_at"
	ELSE u."last_activity_at"
END
FROM latest_activity
WHERE u."id" = latest_activity."user_id";
