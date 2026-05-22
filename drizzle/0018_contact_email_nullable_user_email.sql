ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "contact_email" text;

UPDATE "user"
SET "contact_email" = "email"
WHERE "contact_email" IS NULL
  AND "email" IS NOT NULL
  AND "email" !~* '^telegram:[^@]+@telegram\.user$';

ALTER TABLE "user" ALTER COLUMN "email" DROP NOT NULL;

UPDATE "user"
SET "email" = NULL
WHERE "email" ~* '^telegram:[^@]+@telegram\.user$';
