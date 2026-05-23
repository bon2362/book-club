-- Cleanup after books catalog refactor — apply only after 0021 migration has been live
-- long enough that no writes still target book_name / book_statuses / book_new_flags.

-- 1. Drop legacy book_statuses / book_new_flags (data is now in books.reading_status / books.is_new).
DROP TABLE IF EXISTS "book_statuses";
DROP TABLE IF EXISTS "book_new_flags";

-- 2. signup_books: enforce book_id NOT NULL, switch primary key, drop book_name.
-- Fail loudly if any row still has book_id IS NULL — we never want to drop user
-- signups by accident. Re-run the audit/backfill and resolve the missing
-- mappings before applying this migration.
DO $$
DECLARE
  unmapped_signups int;
BEGIN
  SELECT count(*) INTO unmapped_signups FROM "signup_books" WHERE "book_id" IS NULL;
  IF unmapped_signups > 0 THEN
    RAISE EXCEPTION 'Refusing to drop signup_books.book_name: % rows still have book_id IS NULL. Resolve via legacy_book_mappings backfill before re-running this migration.', unmapped_signups;
  END IF;
END $$;
ALTER TABLE "signup_books" ALTER COLUMN "book_id" SET NOT NULL;
ALTER TABLE "signup_books" DROP CONSTRAINT IF EXISTS "signup_books_user_id_book_name_pk";
ALTER TABLE "signup_books" ADD CONSTRAINT "signup_books_user_id_book_id_pk" PRIMARY KEY ("user_id","book_id");
ALTER TABLE "signup_books" DROP COLUMN IF EXISTS "book_name";

-- 3. book_priorities: same shape change with the same guard.
DO $$
DECLARE
  unmapped_priorities int;
BEGIN
  SELECT count(*) INTO unmapped_priorities FROM "book_priorities" WHERE "book_id" IS NULL;
  IF unmapped_priorities > 0 THEN
    RAISE EXCEPTION 'Refusing to drop book_priorities.book_name: % rows still have book_id IS NULL.', unmapped_priorities;
  END IF;
END $$;
ALTER TABLE "book_priorities" ALTER COLUMN "book_id" SET NOT NULL;
ALTER TABLE "book_priorities" DROP CONSTRAINT IF EXISTS "book_priorities_user_id_book_name_pk";
ALTER TABLE "book_priorities" ADD CONSTRAINT "book_priorities_user_id_book_id_pk" PRIMARY KEY ("user_id","book_id");
ALTER TABLE "book_priorities" DROP COLUMN IF EXISTS "book_name";

-- 4. Optional: drop legacy_book_mappings once no code reads it.
-- DROP TABLE IF EXISTS "legacy_book_mappings";
