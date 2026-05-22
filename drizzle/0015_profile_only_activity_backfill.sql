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
	concat('backfill:user:profile_only:', u."id"),
	u."id",
	'profile_submitted',
	COALESCE(u."emailVerified", u."created_at", now()),
	'user',
	concat('profile_only:', u."id"),
	concat('backfill:user:profile_only:', u."id"),
	json_build_object(
		'sourceColumns',
		json_build_array(
			CASE WHEN NULLIF(BTRIM(u."name"), '') IS NOT NULL THEN 'name' END,
			CASE WHEN NULLIF(BTRIM(u."contacts"), '') IS NOT NULL THEN 'contacts' END
		)
	)::text
FROM "user" u
WHERE u."last_activity_at" IS NULL
	AND (
		NULLIF(BTRIM(u."name"), '') IS NOT NULL
		OR NULLIF(BTRIM(u."contacts"), '') IS NOT NULL
	)
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
WHERE u."id" = latest_activity."user_id"
	AND u."last_activity_at" IS NULL;
