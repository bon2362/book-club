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
  'email:' || u."id",
  u."id",
  'email',
  lower(trim(u."contact_email")),
  lower(trim(u."contact_email")),
  u."created_at",
  COALESCE(u."last_activity_at", u."created_at", now()),
  '{"source":"drop-user-email-backfill"}'
FROM "user" u
WHERE u."contact_email" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "user_identities" ui WHERE ui."user_id" = u."id"
  )
ON CONFLICT ("provider", "provider_account_id") DO NOTHING;

DELETE FROM "verificationToken"
WHERE "expires" < now();

ALTER TABLE "user" DROP COLUMN IF EXISTS "email";
