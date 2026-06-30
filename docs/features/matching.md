# Matching: техническая реализация

Актуальный matching — единый satisfaction flow с реальными именами, временными подтверждениями и закреплением единогласных кругов. Исторический runtime сохранён только git-тегом `matching-legacy-before-simplification-2026-06-29`; его таблицы и колонки физически удалены миграцией `0050_drop_legacy_matching.sql`.

## Поток страницы

`app/matching/page.tsx` выбирает один из трёх экранов:

1. `MatchingWelcome` — пользователь ещё не состоит в активной сессии;
2. `MatchingSatisfactionFlow phase="gate"` — есть активная книга без ранга;
3. доска — `MatchingRealtimeClient`, закреплённые круги, сценарии и каталог.

Welcome сохраняет единое глобальное имя и вступление одной matching-транзакцией. Observer остаётся участником сессии, поэтому Welcome повторно не появляется.

## Доменный переход

Все действия, способные изменить сценарии, проходят через `runMatchingTransition` в `lib/matching/session-transition-db.ts`. Сервис блокирует строку сессии, проверяет роль и статус, применяет действие, пересчитывает сценарии, вызывает reconciliation подтверждений, закрепляет готовые круги каскадом, пишет `matching_events`/`matching_notices` и увеличивает `state_version`.

К транзакционному сервису подключены не только routes внутри `/api/matching`, но и изменение книг, рангов и personal status через обычный профиль/админку, если пользователь состоит в активной matching-сессии.

## Идентичность

- Доменные вычисления используют `userId` только на сервере.
- `circle_key` — SHA-256 от session, book и отсортированного состава; raw IDs в ключе не видны.
- Public state использует `publicRef` и `displayName`.
- `assignMatchingDisplayNames` стабильно различает одинаковые имена.

## Конкурентность

Мутирующий запрос подтверждения передаёт `expectedStateVersion`. Несовпадение возвращает conflict и заставляет клиент обновить state. Уникальные ограничения БД не позволяют иметь два подтверждения или два действующих locked membership для одного пользователя.

## Логи

`matching_events` — смысловой append-oriented журнал для вкладки «Аналитика изменений предпочтений»: actor/subject, событие, книга, before/after, metadata, версия и снимки имён. Все изменяемые matching-таблицы также покрыты триггерами глобального `audit_log`.

## Админский реестр кругов

`GET /api/admin/matching/sessions/{id}/locked-circles` читает полную историю закреплённых и распущенных кругов для выбранной сессии. Ответ включает название книги и неизменяемые snapshots имён участников; `AdminMatchingSession` использует его для реестра и входа в аварийный dissolve-flow.

## Проверки

- Unit: `lib/matching/__tests__/` и route tests.
- E2E: `e2e/matching-satisfaction.spec.ts`, `e2e/matching-realtime.spec.ts`.
- Layout/условный UI: matching-сценарии в `e2e/ui-states.spec.ts`.
- Guard от возврата legacy runtime: `lib/matching/__tests__/no-legacy-runtime.test.ts`.
