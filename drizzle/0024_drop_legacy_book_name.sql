-- Final cleanup for the books catalog refactor.
--
-- Runtime uses book_id as the source of truth since PR #146. This migration
-- removes the old title cache columns after verifying no rows depend on a
-- missing book_id.
DO $$
DECLARE
  unmapped_signups integer;
  unmapped_priorities integer;
BEGIN
  SELECT count(*) INTO unmapped_signups
  FROM "signup_books"
  WHERE "book_id" IS NULL;

  IF unmapped_signups > 0 THEN
    RAISE EXCEPTION 'Refusing to drop signup_books.book_name: % rows still have book_id IS NULL.', unmapped_signups;
  END IF;

  SELECT count(*) INTO unmapped_priorities
  FROM "book_priorities"
  WHERE "book_id" IS NULL;

  IF unmapped_priorities > 0 THEN
    RAISE EXCEPTION 'Refusing to drop book_priorities.book_name: % rows still have book_id IS NULL.', unmapped_priorities;
  END IF;
END $$;

ALTER TABLE "signup_books" DROP COLUMN IF EXISTS "book_name";
ALTER TABLE "book_priorities" DROP COLUMN IF EXISTS "book_name";

-- Historical Google Books cover cache. Runtime cover data lives in books.cover_url.
DROP TABLE IF EXISTS "book_covers";
