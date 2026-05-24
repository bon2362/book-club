-- Final cleanup after the catalog moved fully from Google Sheets to books.
--
-- `size` was a legacy Sheets field that is not shown or edited anywhere.
-- `sheets_import` now means the same thing as admin-managed catalog data.
-- `archived_at` duplicated `visibility = 'hidden'`; visibility is now the
-- single source of truth for whether a book is visible to participants.

WITH first_signals AS (
  SELECT
    b."id",
    LEAST(
      b."created_at",
      COALESCE(b."published_at", b."created_at"),
      COALESCE(MIN(sb."signed_at"), b."created_at"),
      COALESCE(MIN(bp."updated_at"), b."created_at"),
      COALESCE(MIN(bs."created_at"), b."created_at")
    ) AS inferred_created_at
  FROM "books" b
  LEFT JOIN "signup_books" sb ON sb."book_id" = b."id"
  LEFT JOIN "book_priorities" bp ON bp."book_id" = b."id"
  LEFT JOIN "book_submissions" bs ON bs."book_id" = b."id"
  GROUP BY b."id"
)
UPDATE "books" b
SET "created_at" = first_signals.inferred_created_at
FROM first_signals
WHERE b."id" = first_signals."id"
  AND first_signals.inferred_created_at < b."created_at";

UPDATE "books"
SET "source" = 'admin'
WHERE "source" = 'sheets_import';

ALTER TABLE "books" DROP CONSTRAINT IF EXISTS "books_source_check";
ALTER TABLE "books"
  ADD CONSTRAINT "books_source_check" CHECK ("source" IN ('admin','submission'));

ALTER TABLE "books"
  DROP COLUMN IF EXISTS "size",
  DROP COLUMN IF EXISTS "archived_at";
