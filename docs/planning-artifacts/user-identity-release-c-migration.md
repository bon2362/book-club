# Release C: миграция legacy Telegram PK → UUID

**Дата:** 2026-05-19
**Issue:** [#122](https://github.com/bon2362/book-club/issues/122)
**План:** [user-identity-activity-refactor-plan.md](./user-identity-activity-refactor-plan.md), Этап 8

## Что сделано

Завершён последний релиз из плана — физическая замена primary key у двух legacy пользователей с `users.id = "telegram:<numeric_id>"` на canonical UUID. После миграции `users.id` всегда UUID; provider id хранится только в `user_identities`.

## Затронутые пользователи

| telegram_username | старый id | новый UUID |
|---|---|---|
| MashaaKaaa | `telegram:63199968` | `68ed5db4-191e-4c80-a914-d4daf88e5e90` |
| julia555x | `telegram:1793660681` | `1ce37975-e4ab-4aff-b409-6b93ce2f5c85` |

Synthetic email `telegram:<id>@telegram.user` сохранён (display-forbidden, скрыт formatter'ом из Release A). Реальная очистка email — отдельная схемная задача.

## FK-строки, переписанные на новые UUID

| таблица | строк |
|---|---|
| book_priorities | 14 |
| book_submissions | 5 |
| signup_books | 16 |
| user_activity_events | 37 |
| user_identities | 2 |
| **итого** | **74** |

Таблицы `account`, `session`, `feedback`, `telegram_preauth_tokens` legacy-строк не содержали.

## Инварианты после миграции

- Остатков `telegram:%` ни в одной из 9 FK-таблиц: **0**
- Orphan FK rows: **0**
- Дубликатов `(provider, provider_account_id)` в `user_identities`: **0**
- Total users: **10** (никого не потеряли)
- Lookup по Telegram numeric id (`63199968`, `1793660681`) через `user_identities` корректно резолвит canonical UUID

## Процесс

1. Backfill `user_identities` для legacy юзеров (idempotent, перед PK-миграцией).
2. На каждого юзера — одна транзакция:
   - временно переименовать email старого юзера (UNIQUE constraint);
   - INSERT нового user row с UUID, копируя все поля и оригинальный email;
   - UPDATE всех FK-таблиц со старого id на новый;
   - DELETE старой user row.

## Сайд-эффекты

- Оба пользователя будут разлогинены при следующем заходе (JWT в куках содержит `telegram:NNN`, такого id в БД больше нет). При повторном входе через Telegram `resolveOrCreateUserFromIdentity('telegram', numericId)` находит их по `user_identities.provider_account_id` и логинит в тот же аккаунт со всеми данными.
- Удалён dead-код `findLegacyTelegramUserId` в `lib/user-identities.ts` и соответствующий unit-тест.

## Скрипты

Скрипты миграции (`check-telegram-ids.mjs`, `backfill-legacy-telegram-identities.mjs`, `migrate-legacy-telegram-pks.mjs`, `verify-pk-migration.mjs`) выполнены одноразово и не сохранены в репо. Миграция повторно не воспроизводится: `telegram:*` пользователей в `users` больше нет.
