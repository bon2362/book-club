-- drizzle/0052_backfill_book_ranks.sql
-- Разовый бэкфилл. Все существующие ранги проставлялись только явным reorder → manual.
-- Нератированные записи (personal_status IS NULL) дописываем в конец по signed_at → auto.
-- Транзакция помечает audit-триггер как системную операцию (source='system', actor=null).
BEGIN;
SET LOCAL app.audit_source = 'system';

UPDATE "book_priorities" SET "rank_source" = 'manual';

INSERT INTO "book_priorities" ("user_id", "book_id", "rank", "rank_source", "updated_at")
SELECT
  s."user_id",
  s."book_id",
  COALESCE(m.max_rank, 0) + ROW_NUMBER() OVER (
    PARTITION BY s."user_id" ORDER BY s."signed_at", s."book_id"
  ),
  'auto',
  now()
FROM "signup_books" s
LEFT JOIN (
  SELECT "user_id", MAX("rank") AS max_rank FROM "book_priorities" GROUP BY "user_id"
) m ON m."user_id" = s."user_id"
WHERE s."personal_status" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "book_priorities" bp
    WHERE bp."user_id" = s."user_id" AND bp."book_id" = s."book_id"
  );

COMMIT;
