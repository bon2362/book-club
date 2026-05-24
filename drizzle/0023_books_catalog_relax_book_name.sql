-- Phase 1 of books-catalog dual-write removal.
-- Verified before applying: signup_books / book_priorities / approved
-- book_submissions all have book_id IS NOT NULL (production count = 0 nulls,
-- 2026-05-24).
--
-- This migration:
--   1. Makes book_name nullable (so runtime can stop writing it).
--   2. Sets book_id NOT NULL with a final guard.
--   3. Switches the primary key from (user_id, book_name) to (user_id, book_id).
--
-- The legacy book_name column is intentionally NOT dropped here so the rollout
-- can be staged: apply this migration first, deploy the code that writes only
-- book_id, observe production, THEN apply the follow-up `0024_drop_book_name.sql`
-- to remove the column entirely.

-- signup_books -----------------------------------------------------
DO $$
DECLARE
  unmapped int;
BEGIN
  SELECT count(*) INTO unmapped FROM "signup_books" WHERE "book_id" IS NULL;
  IF unmapped > 0 THEN
    RAISE EXCEPTION 'Refusing to relax signup_books: % rows still have book_id IS NULL. Resolve via legacy_book_mappings backfill before re-running.', unmapped;
  END IF;
END $$;

-- Order matters: drop the PK before relaxing book_name's NOT NULL constraint,
-- because PostgreSQL refuses DROP NOT NULL on a PK column.
ALTER TABLE "signup_books" DROP CONSTRAINT IF EXISTS "signup_books_user_id_book_name_pk";
ALTER TABLE "signup_books" ALTER COLUMN "book_id" SET NOT NULL;
ALTER TABLE "signup_books" ALTER COLUMN "book_name" DROP NOT NULL;
ALTER TABLE "signup_books" ADD CONSTRAINT "signup_books_user_id_book_id_pk" PRIMARY KEY ("user_id","book_id");

-- book_priorities --------------------------------------------------
DO $$
DECLARE
  unmapped int;
BEGIN
  SELECT count(*) INTO unmapped FROM "book_priorities" WHERE "book_id" IS NULL;
  IF unmapped > 0 THEN
    RAISE EXCEPTION 'Refusing to relax book_priorities: % rows still have book_id IS NULL.', unmapped;
  END IF;
END $$;

ALTER TABLE "book_priorities" DROP CONSTRAINT IF EXISTS "book_priorities_user_id_book_name_pk";
ALTER TABLE "book_priorities" ALTER COLUMN "book_id" SET NOT NULL;
ALTER TABLE "book_priorities" ALTER COLUMN "book_name" DROP NOT NULL;
ALTER TABLE "book_priorities" ADD CONSTRAINT "book_priorities_user_id_book_id_pk" PRIMARY KEY ("user_id","book_id");
