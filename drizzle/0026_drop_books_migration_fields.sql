-- Drop one-shot books catalog migration helpers after the runtime moved fully
-- to books.id and book_submissions.book_id.

DO $$
DECLARE
  unlinked_approved integer;
BEGIN
  SELECT count(*) INTO unlinked_approved
  FROM "book_submissions"
  WHERE "status" = 'approved'
    AND "book_id" IS NULL;

  IF unlinked_approved > 0 THEN
    RAISE EXCEPTION 'Refusing cleanup: % approved book_submissions rows still have book_id IS NULL.', unlinked_approved;
  END IF;
END $$;

DROP INDEX IF EXISTS "books_canonical_key_idx";
DROP INDEX IF EXISTS "books_source_submission_id_idx";
DROP INDEX IF EXISTS "books_source_submission_id_unique";

ALTER TABLE "books"
  DROP COLUMN IF EXISTS "canonical_key",
  DROP COLUMN IF EXISTS "legacy_sheets_row_id",
  DROP COLUMN IF EXISTS "source_submission_id";

DROP TABLE IF EXISTS "legacy_book_mappings";
