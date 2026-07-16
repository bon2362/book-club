-- Исправляет опечатку из исторического импорта каталога 0021.
-- Legacy-миграцию не переписываем: эта коррекция идемпотентно обновляет живые данные.
-- scripts/apply-migration.mjs сам выполняет файл в одной транзакции.
SET LOCAL app.audit_source = 'system';
SET LOCAL app.audit_actor = '';
SET LOCAL app.audit_label = '';
SET LOCAL app.audit_reason = 'correct imported catalog title typo';

UPDATE "books"
SET
  "title" = 'Доктрина шока',
  "updated_at" = now()
WHERE "id" = '9b351ca1-6513-43be-80d1-1547eb900984'
  AND "title" = 'Доктирна шока';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "books"
    WHERE "id" = '9b351ca1-6513-43be-80d1-1547eb900984'
      AND "title" = 'Доктрина шока'
  ) THEN
    RAISE EXCEPTION 'Shock Doctrine catalog title correction postcondition failed';
  END IF;
END
$$;
