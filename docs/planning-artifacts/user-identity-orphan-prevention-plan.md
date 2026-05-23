# План: запретить пользователей без user_identities

Дата: 2026-05-23

## Контекст

В продовой БД найден пользователь `tutu1520@protonmail.com`, у которого есть строка в `user`, но нет строки в `user_identities`.

Это нарушает целевое правило identity-модели:

- `user` хранит внутренний профиль участника;
- `user_identities` хранит способ входа: email, Google или Telegram;
- у каждого зарегистрированного пользователя должна быть хотя бы одна identity.

Текущая причина: email/Google OAuth flow может сначала создать строку в `user` через Auth.js adapter, а затем отдельным шагом синхронизировать `user_identities` в `callbacks.signIn`. Если второй шаг не выполнился или упал, пользователь остаётся в промежуточном состоянии.

## Цель

Сделать так, чтобы после регистрации или входа не появлялись пользователи без `user_identities`.

Практическое правило:

- если identity записалась успешно, вход продолжается;
- если identity не записалась, вход считается неуспешным, сессия не создаётся;
- в логах остаётся техническая ошибка для диагностики;
- существующие orphan-users находятся и чинятся разовым backfill.

## План изменений

### 1. Разово починить найденного пользователя

Добавить `email` identity для `tutu1520@protonmail.com`.

Ожидаемая запись:

- `user_id`: `4c6243aa-265c-46fa-aae8-fe3fc9632b32`;
- `provider`: `email`;
- `provider_account_id`: `tutu1520@protonmail.com`;
- `email`: `tutu1520@protonmail.com`;
- `metadata.source`: `manual-backfill`.

После backfill проверить:

- у пользователя появилась ровно одна email identity;
- запрос пользователей без identities возвращает 0 строк.

### 2. Ужесточить signIn callback

В `lib/auth.ts` изменить обработку ошибок identity sync:

- `IdentityConflictError` по-прежнему должен прерывать вход;
- остальные ошибки identity sync тоже должны прерывать вход, а не только логироваться;
- логирование оставить, чтобы в Vercel logs была причина.

Практический эффект: если `linkIdentityToUser` или `resolveOrCreateUserFromIdentity` не смогли записать identity, NextAuth не должен создавать валидную сессию.

### 3. Свести создание email-пользователя к identity helper

Проверить, можно ли для email magic link использовать `resolveOrCreateUserFromIdentity('email', email, profile)` как основной путь создания пользователя.

Если Auth.js adapter всё равно обязан сначала вызвать `createUser`, оставить adapter, но считать `callbacks.signIn` обязательным integrity step:

- adapter создаёт `user`;
- signIn callback обязан создать/обновить `user_identities`;
- ошибка на втором шаге прерывает вход.

Если получится безопасно перенести создание email user целиком в helper, выбрать этот вариант как более чистый.

### 4. Добавить тесты

Обновить unit-тесты `lib/auth.test.ts`:

- ошибка `linkIdentityToUser` для email sign-in прерывает вход;
- ошибка `linkIdentityToUser` для Google OAuth прерывает вход;
- pre-send фаза magic link всё ещё не создаёт identity;
- успешный Resend/email sign-in создаёт email identity.

Обновить или добавить тест adapter-flow, если будет изменён `lib/auth-adapter.ts`.

E2E нужен, если меняется пользовательский auth-flow или видимая ошибка входа. Минимальный полезный сценарий:

- email magic-link/test-mode вход создаёт пользователя;
- после входа у пользователя есть `user_identities`;
- после reload сессия остаётся валидной.

### 5. Добавить audit/backfill скрипт

Добавить одноразовый или админский скрипт для проверки инварианта:

```sql
select u.id, u.contact_email, u.created_at
from "user" u
where not exists (
  select 1
  from user_identities ui
  where ui.user_id = u.id
);
```

Для пользователей с `contact_email` скрипт может создавать email identity автоматически.

Для пользователей без email скрипт должен только вывести отчёт, потому что provider нельзя надёжно угадать.

### 6. Проверить перед релизом

Перед коммитом:

- явно решить: `E2E: нужен / не нужен — причина`;
- запустить `npm run lint`;
- запустить `npm run typecheck`;
- запустить `npm test`;
- если меняется auth-flow, запустить соответствующий Playwright auth тест.

Перед деплоем или сразу после деплоя:

- выполнить audit-запрос для orphan-users;
- убедиться, что он возвращает 0 строк;
- проверить Vercel logs на ошибки `Failed to sync user identity during sign-in`.

## Критерии готовности

- В продовой БД нет пользователей без `user_identities`.
- Новый email sign-in не может завершиться валидной сессией, если identity sync упал.
- Новый Google OAuth sign-in не может завершиться валидной сессией, если identity sync упал.
- Telegram flow остаётся без регрессий: Telegram identity создаётся через `resolveOrCreateUserFromIdentity`.
- Unit-тесты покрывают успешную и ошибочную синхронизацию identity.
