# Matching Presence Audit Noise Fix

**Goal:** Восстановить подавление чистых `last_seen_at` heartbeat-апдейтов в глобальном audit log.

**Root cause:** `drizzle/0047_summary_helpful_reactions.sql` переопределил `audit_capture()` на базе устаревшей версии и потерял условие для `matching_session_participants`, добавленное в `0042`.

## Steps

1. Красным migration-test зафиксировать три обязательных telemetry-фильтра и все актуальные masking-правила.
2. Добавить идемпотентную `0049`-миграцию только с `CREATE OR REPLACE FUNCTION audit_capture()`; таблицы и триггеры не менять.
3. Обновить техническое описание аудита и Wiki базы данных.
4. Проверить миграцию на E2E Neon-ветке: чистый heartbeat не создаёт audit row, а реальное изменение участника создаёт.
5. Пройти lint/typecheck/unit/build, PR-flow и после merge применить тот же SQL к production через `scripts/apply-migration.mjs`.
6. Проверить production-функцию и отсутствие новых heartbeat-строк; старые шумовые строки не удалять.

