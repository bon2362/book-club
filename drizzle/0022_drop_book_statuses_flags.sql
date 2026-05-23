-- Stage 6 partial cleanup: drop legacy book_statuses / book_new_flags.
-- Data was merged into books.reading_status and books.is_new by migration 0021,
-- and all runtime endpoints now read/write books directly (admin book-status and
-- book-new-flag routes were updated alongside this migration).
--
-- Safe to apply once 0021 has been applied and the new application code is
-- deployed. The follow-up 0023_books_catalog_drop_book_name.sql drops the
-- legacy book_name columns from signup_books / book_priorities after the
-- runtime is fully on book_id.

DROP TABLE IF EXISTS "book_statuses";
DROP TABLE IF EXISTS "book_new_flags";
