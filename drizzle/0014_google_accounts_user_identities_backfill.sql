DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "account" a
		INNER JOIN "user_identities" ui
			ON ui."provider" = 'google'
			AND ui."provider_account_id" = a."providerAccountId"
		WHERE a."provider" = 'google'
			AND ui."user_id" <> a."userId"
	) THEN
		RAISE EXCEPTION 'Google account/user_identities ownership conflict detected';
	END IF;
END $$;
--> statement-breakpoint
INSERT INTO "user_identities" (
	"id",
	"user_id",
	"provider",
	"provider_account_id",
	"email",
	"created_at",
	"last_seen_at",
	"metadata"
)
SELECT
	concat('backfill:account:google:', md5(a."providerAccountId")),
	a."userId",
	'google',
	a."providerAccountId",
	u."email",
	COALESCE(u."created_at", now()),
	COALESCE(u."last_activity_at", u."created_at", now()),
	json_build_object('sourceTable', 'account', 'sourceProvider', a."provider")::text
FROM "account" a
INNER JOIN "user" u ON u."id" = a."userId"
WHERE a."provider" = 'google'
ON CONFLICT ("provider", "provider_account_id") DO UPDATE
SET
	"email" = COALESCE(EXCLUDED."email", "user_identities"."email"),
	"last_seen_at" = GREATEST("user_identities"."last_seen_at", EXCLUDED."last_seen_at"),
	"metadata" = EXCLUDED."metadata"
WHERE "user_identities"."user_id" = EXCLUDED."user_id";
--> statement-breakpoint
INSERT INTO "user_identities" (
	"id",
	"user_id",
	"provider",
	"provider_account_id",
	"email",
	"created_at",
	"last_seen_at",
	"metadata"
)
SELECT
	concat('backfill:user:email:', md5(lower(u."email"))),
	u."id",
	'email',
	lower(u."email"),
	lower(u."email"),
	COALESCE(u."created_at", now()),
	COALESCE(u."last_sign_in_at", u."last_activity_at", u."created_at", now()),
	json_build_object('sourceTable', 'user', 'sourceColumn', 'auth_provider')::text
FROM "user" u
WHERE u."auth_provider" = 'email'
ON CONFLICT ("provider", "provider_account_id") DO UPDATE
SET
	"email" = COALESCE(EXCLUDED."email", "user_identities"."email"),
	"last_seen_at" = GREATEST("user_identities"."last_seen_at", EXCLUDED."last_seen_at"),
	"metadata" = EXCLUDED."metadata"
WHERE "user_identities"."user_id" = EXCLUDED."user_id";
