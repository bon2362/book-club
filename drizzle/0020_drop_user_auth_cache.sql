UPDATE "user" u
SET "contacts" = '@' || COALESCE(ui."telegram_username", u."telegram_username")
FROM "user_identities" ui
WHERE ui."user_id" = u."id"
  AND ui."provider" = 'telegram'
  AND COALESCE(ui."telegram_username", u."telegram_username") IS NOT NULL
  AND NULLIF(trim(COALESCE(u."contacts", '')), '') IS NULL;

UPDATE "user_identities" ui
SET "telegram_username" = u."telegram_username"
FROM "user" u
WHERE ui."user_id" = u."id"
  AND ui."provider" = 'telegram'
  AND ui."telegram_username" IS NULL
  AND u."telegram_username" IS NOT NULL;

ALTER TABLE "user" DROP COLUMN IF EXISTS "telegram_username";
ALTER TABLE "user" DROP COLUMN IF EXISTS "auth_provider";
ALTER TABLE "user" DROP COLUMN IF EXISTS "last_sign_in_at";
