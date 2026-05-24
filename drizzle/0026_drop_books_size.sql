-- Drop the legacy `size` column from books.
--
-- The admin catalog redesign removes the free-text "size" field from the editor
-- form. The column was carrying empty strings for every row created since the
-- catalog migrated to Postgres; the legacy Sheets value is no longer surfaced
-- anywhere in the product. Dropping it keeps the schema honest.
ALTER TABLE "books" DROP COLUMN IF EXISTS "size";
