-- Cleanup after books catalog refactor — apply only after 0021 migration has been live
-- long enough that no writes still target book_name / book_statuses / book_new_flags.

-- 1. Drop legacy book_statuses / book_new_flags (data is now in books.reading_status / books.is_new).
DROP TABLE IF EXISTS "book_statuses";
DROP TABLE IF EXISTS "book_new_flags";

-- 2. signup_books: enforce book_id NOT NULL, switch primary key, drop book_name.
DELETE FROM "signup_books" WHERE "book_id" IS NULL;
ALTER TABLE "signup_books" ALTER COLUMN "book_id" SET NOT NULL;
ALTER TABLE "signup_books" DROP CONSTRAINT IF EXISTS "signup_books_user_id_book_name_pk";
ALTER TABLE "signup_books" ADD CONSTRAINT "signup_books_user_id_book_id_pk" PRIMARY KEY ("user_id","book_id");
ALTER TABLE "signup_books" DROP COLUMN IF EXISTS "book_name";

-- 3. book_priorities: same shape change.
DELETE FROM "book_priorities" WHERE "book_id" IS NULL;
ALTER TABLE "book_priorities" ALTER COLUMN "book_id" SET NOT NULL;
ALTER TABLE "book_priorities" DROP CONSTRAINT IF EXISTS "book_priorities_user_id_book_name_pk";
ALTER TABLE "book_priorities" ADD CONSTRAINT "book_priorities_user_id_book_id_pk" PRIMARY KEY ("user_id","book_id");
ALTER TABLE "book_priorities" DROP COLUMN IF EXISTS "book_name";

-- 4. Optional: drop legacy_book_mappings once no code reads it.
-- DROP TABLE IF EXISTS "legacy_book_mappings";
