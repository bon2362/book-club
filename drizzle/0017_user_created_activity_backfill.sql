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
	concat('backfill:user_created:', u."id"),
	u."id",
	'user_created',
	u."created_at",
	'backfill',
	'user',
	concat('backfill:user_created:', u."id"),
	json_build_object('sourceTable', 'user', 'sourceColumn', 'created_at')::text
FROM "user" u
WHERE u."created_at" IS NOT NULL
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
	AND (
		u."last_activity_at" IS NULL
		OR u."last_activity_at" < latest_activity."occurred_at"
	);
