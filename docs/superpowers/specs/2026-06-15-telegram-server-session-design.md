# Telegram-вход: серверная выдача сессии (убираем клиентский signIn)

**Дата:** 2026-06-15
**Статус:** утверждён к реализации

## Проблема

Вход через Telegram периодически не срабатывает на мобильных браузерах (iOS). Поэтапная диагностика (PR #367, #383, #393) доказательно локализовала сбой:

1. `/api/auth/telegram/callback` отрабатывает успешно — HMAC проходит, пользователь создаётся, preauth-токен выдаётся (в БД токены с `created_at`, но `used_at=NULL`).
2. Страница `/auth/telegram` вызывает клиентский `signIn('telegram-preauth', …)`, который должен обменять токен на сессию. **Этот POST не доходит до сервера** (нет ни одной строки `preauth_*` в `telegram_login_failures`, токен не потреблён).

Причина — клиентский кросс-сайт POST `signIn` к NextAuth (CSRF/cookie-шаг) не проходит в iOS-браузере после перехода через `oauth.telegram.org`.

## Решение

Убрать клиентский обмен. Callback после верификации **сам выдаёт сессию на сервере** (кодирует session-JWT и ставит куку) и редиректит сразу на `/`. Двухпрыжковая схема (preauth-токен + страница `/auth/telegram` + провайдер `telegram-preauth`) существовала только ради обхода «серверный signIn в v5 ненадёжен» — но прямая выдача куки через `encode` надёжна и **уже используется в коде** (`app/api/test/session/route.ts`).

**Почему это чинит iOS:** кука ставится сервером на ответе-редиректе, на нашем же домене (first-party, `SameSite=Lax`). Хрупкий кросс-сайт `signIn` POST исчезает; при переходе на `/` браузер штатно отдаёт first-party куку.

## Новый флоу

```
GET /api/auth/telegram/callback?<telegram data + hash>
  1. verifyTelegramHashWithReason(...)            — как сейчас; провал → recordTelegramLoginFailure + redirect /?auth=failed
  2. resolveOrCreateUserFromIdentity('telegram')  — как сейчас
  3. issueServerSession(res, user, { secure })    — НОВОЕ
  4. redirect → /                                  — пользователь залогинен
```

## Компонент: `issueServerSession` (новый `lib/auth-session.ts`)

Назначение: закодировать session-JWT и поставить куку сессии NextAuth на переданный `NextResponse`.

```
issueServerSession(res, { userId, email, name, provider }, { secure, maxAgeSeconds? })
```

- кодирует JWT через `encode` из `@auth/core/jwt`: `token = { sub: userId, email, name, provider }`, `secret = AUTH_SECRET ?? NEXTAUTH_SECRET`, `salt = <имя куки>`;
- **имя куки и salt зависят от окружения** (критично):
  - `secure=true` (prod, HTTPS) → `__Secure-authjs.session-token`;
  - `secure=false` (dev/тест, HTTP) → `authjs.session-token`;
  - salt ВСЕГДА равен имени куки (NextAuth v5 так кодирует/декодирует);
- ставит куку: `httpOnly: true, sameSite: 'lax', path: '/', secure: <secure>, maxAge: <maxAgeSeconds>`;
- `maxAgeSeconds` по умолчанию = `30 * 24 * 60 * 60` (дефолт сессии NextAuth — чтобы Telegram-вход не давал более короткую сессию, чем другие методы).

**Поля `isAdmin` / `contactEmail` НЕ кодируем** — `jwt`-callback (lib/auth.ts) на первом же запросе подтягивает их из БД по `token.sub`. Серверной куке достаточно корректного `sub`.

`secure` вычисляется в callback из протокола запроса (`origin.startsWith('https')`).

**DRY:** `app/api/test/session/route.ts` переводится на `issueServerSession` (одна точка правды). Тест-роут работает по HTTP → `secure=false` → имя `authjs.session-token` (как сейчас).

## Что удаляем

- Провайдер `telegram-preauth` в `lib/auth.ts` (вместе с его диагностикой `preauth_*` — она была нужна для флоу, который уходит).
- Страница `app/auth/telegram/page.tsx`.
- В callback: создание preauth-токена; редирект на `/auth/telegram`.
- В cron `telegram-preauth-cleanup`: вызов `cleanupTelegramPreauthTokens()` (сам cron-роут и вызов `cleanupTelegramLoginFailures()` ОСТАЮТСЯ).
- В `lib/telegram-auth.ts`: `createTelegramPreauthToken`, `consumeTelegramPreauthToken`, `cleanupTelegramPreauthTokens` (станут неиспользуемыми).
- Регенерировать `lib/site-routes.generated.ts` (`scripts/build-routes.ts`) — `/auth/telegram` исчезнет из списка.

## Что сознательно НЕ трогаем

- **Таблица `telegram_preauth_tokens` остаётся в БД** (и её схема в `schema.ts`, и запись в `AUDITED_TABLES`/триггер). Дроп таблицы = destructive-миграция вручную в проде; не делаем её в одном PR с рискованным auth-изменением. Отдельный cleanup-PR позже, когда новый флоу подтвердится. В `schema.ts` к таблице добавить комментарий «DEPRECATED, см. spec 2026-06-15».
- `telegram_login_failures` и `recordTelegramLoginFailure` (стадия верификации) — остаются.
- Google One Tap, magic-link — не трогаем (работают).

## Обработка ошибок

- Провал HMAC → как сейчас: `recordTelegramLoginFailure` (verify-стадия) + redirect `/?auth=failed`.
- Если `issueServerSession`/`encode` бросает → `try/catch` → `console.error('[telegram-callback] session issue failed', …)` + redirect `/?auth=failed`. Секреты (hash, токен бота, сам JWT) не логировать.

## Тесты

- **Новый** unit на `issueServerSession`: проверить имя куки и salt для `secure=true`/`false`, поля токена (`sub`/`email`/`name`/`provider`), флаги куки. `encode` мокать (как в `app/api/test/session/route.test.ts`).
- **Переписать** `app/api/auth/telegram/callback/route.test.ts`: успех → ставится кука сессии + redirect на `/` (а не на `/auth/telegram?token`); провал HMAC → redirect `/?auth=failed` + `recordTelegramLoginFailure` вызвана, кука НЕ ставится.
- **Удалить** из `lib/auth.test.ts` describe `telegram-preauth authorize` (провайдер удалён).
- **Подчистить** `lib/telegram-auth.test.ts`: убрать тесты удалённых функций (если есть), оставить `verifyTelegramHashWithReason` / `recordTelegramLoginFailure` / `cleanupTelegramLoginFailures`.
- `app/api/test/session/route.test.ts`: обновить под рефактор на `issueServerSession` (поведение и кука прежние).
- E2E `e2e/telegram-auth.spec.ts` логинится через `/api/test/session` (не через реальный callback) → должен пройти без изменений, если тест-роут сохраняет поведение.

## Документация

- `docs/features/auth.md`: заменить описание двухпрыжкового флоу на серверную выдачу сессии; отметить, что preauth-аппарат удалён, таблица оставлена deprecated.
- `docs/wiki/Auth-and-Users.md`: обновить пользовательское описание (вход через Telegram теперь в один шаг, без промежуточной страницы).

## Риск и выкат

Изменение трогает выдачу сессии для ВСЕХ Telegram-входов, включая работающие (desktop). Главный риск — ошибка в имени куки/salt/secure в проде сломает вход всем.

Подстраховка:
1. Автотесты (CI до выката).
2. После деплоя — ручная проверка владельцем: вход с телефона И с компьютера.
3. Диагностика verify-стадии и журнал в БД остаются — сбои видны.
4. Откат = revert одной PR.
```
