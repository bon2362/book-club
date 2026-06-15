# Telegram-вход через бота (deep-link) — B2

**Дата:** 2026-06-15
**Статус:** утверждён к реализации (поэтапный релиз)

## Проблема

Вход через веб-виджет Telegram (`oauth.telegram.org`) ненадёжен на мобильных браузерах: на Chrome iOS попытка **не доходит до нашего сервера** (доказано экспериментом 2026-06-15 — ноль следов в БД; идентично на старом коде и на B1). Барьер на стороне Telegram, выше нашего сервера. Никакая серверная правка веб-виджета это не лечит.

## Решение (B2)

Вход через **бота по deep-link**, минуя `oauth.telegram.org` полностью. Аналог email-magic-link, только ссылку шлёт Telegram-бот. Авторизация происходит в приложении Telegram (оно сообщает боту проверенную личность пользователя), на сайт пользователь попадает по обычной first-party ссылке — кросс-сайт-барьер отсутствует по построению.

## Флоу (вариант B — ссылка из бота)

```
1. На сайте «Войти через Telegram» → открывается t.me/<bot>?start=login
2. Пользователь жмёт Start → Telegram шлёт боту /start login (с проверенным from: id/username/name)
3. Вебхук: резолвит пользователя, выдаёт одноразовый токен, шлёт ботом сообщение
   с кнопкой-ссылкой <site>/api/auth/telegram/login?token=<token>
4. Пользователь тапает ссылку → first-party переход на наш сайт → сессия выдана → /
```

## Компоненты

### 1. Токен-хранилище (переиспользуем существующее)
Таблица `telegram_preauth_tokens` уже есть в БД (после B1 помечена DEPRECATED). **Разdeprecate** (обновить комментарий: «используется B2 bot-login»). Вернуть в `lib/telegram-auth.ts` функции (восстановить из истории до B1):
- `createTelegramPreauthToken(userId) → { token }` — генерит случайный токен, пишет hash + userId + expiresAt (TTL 5 мин).
- `consumeTelegramPreauthToken(token) → userId | null` — атомарно помечает used, проверяет expiresAt и usedAt is null.
- `cleanupTelegramPreauthTokens(now)` — вернуть, добавить вызов обратно в cron `telegram-preauth-cleanup`.
**Миграция БД не нужна** — таблица уже в проде.

### 2. Отправка сообщений ботом — `lib/telegram-bot.ts`
- `sendTelegramMessage(chatId, text, loginUrl)` → POST `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage` с inline-кнопкой (`reply_markup.inline_keyboard` с `url: loginUrl`).
- Без секретов в логах. Ошибку сети ловить, логировать `[telegram-bot]`.

### 3. Вебхук — `app/api/telegram/webhook/route.ts` (POST)
- Проверить заголовок `X-Telegram-Bot-Api-Secret-Token` === `process.env.TELEGRAM_WEBHOOK_SECRET`; иначе 401.
- Разобрать `update.message`. Если текст начинается с `/start`:
  - `from = update.message.from` → `resolveOrCreateUserFromIdentity('telegram', String(from.id), { name: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || String(from.id), telegramUsername: from.username ?? null, metadata: { source: 'telegram-bot' } })`.
  - `createTelegramPreauthToken(user.id)` → token.
  - `loginUrl = ${process.env.NEXTAUTH_URL}/api/auth/telegram/login?token=${token}`.
  - `sendTelegramMessage(from.id, 'Нажмите, чтобы войти на slowreading.club', loginUrl)`.
  - лог `[telegram-webhook] ok { userId, tgId }`.
- Любой другой/непонятный апдейт → ответить 200 (ack, игнор), не падать.
- Всегда быстро отвечать 200, чтобы Telegram не ретраил (кроме 401 на плохом секрете).

### 4. Приёмник ссылки — `app/api/auth/telegram/login/route.ts` (GET)
- `token` из query. `consumeTelegramPreauthToken(token)` → userId.
- `null` → `recordTelegramLoginFailure({ reason: 'bot_token_invalid', ... })` + redirect `/?auth=failed`.
- иначе: подтянуть `users` (name, contactEmail) по userId; `const res = NextResponse.redirect(new URL('/', origin)); await issueServerSession(res, { userId, name, email: contactEmail, provider: 'telegram' }, { secure: origin.startsWith('https') })`; лог `[telegram-login] ok`; return res.
- Переиспользует `issueServerSession` из B1 — тот же надёжный механизм first-party куки.

### 5. UI — `components/nd/AuthModal.tsx`
- Основная кнопка «Войти через Telegram» → ссылка-`<a href="https://t.me/${NEXT_PUBLIC_TELEGRAM_BOT_NAME}?start=login">` (открывает бота; работает на mobile и desktop).
- Старый виджет оставить как **запасной** (мелкая ссылка «войти через виджет Telegram») — на период обкатки. После подтверждения на проде — отдельным PR можно убрать.
- Дизайн строго по канону (токены, острые углы, без теней).

### 6. Разовая настройка (ops, при выкате)
- Добавить env `TELEGRAM_WEBHOOK_SECRET` (production + preview) — сгенерировать случайный.
- Вызвать Telegram `setWebhook` с `url=<site>/api/telegram/webhook` и `secret_token=<TELEGRAM_WEBHOOK_SECRET>`. Один вебхук на бота, смотрит на боевой домен (см. раздел Релиз).
- `env.ts`: добавить `TELEGRAM_WEBHOOK_SECRET` в схему (optional, т.к. локально не нужен).

## Безопасность

- Вебхук защищён `secret_token` (Telegram шлёт его заголовком; чужой POST → 401).
- Логин-токен случайный, хранится хэшем, одноразовый, TTL 5 мин.
- Ссылка для входа уходит **только в личный чат инициатора** (`chatId = from.id`) — перехват невозможен; уровень доверия как у любого Telegram-входа.

## Обработка ошибок

- Плохой секрет вебхука → 401.
- Непонятный апдейт → 200, игнор.
- `resolveOrCreateUserFromIdentity` упал → бот шлёт «Не удалось войти, попробуйте позже», вебхук отвечает 200.
- Токен протух/использован → `/?auth=failed` + запись в `telegram_login_failures` (reason `bot_token_invalid`).

## Тесты

- Юнит вебхука: валидный `/start` при верном секрете → `resolveOrCreateUserFromIdentity` + `createTelegramPreauthToken` + `sendTelegramMessage` вызваны, 200; неверный секрет → 401; не-`/start` апдейт → 200 без действий. Bot API замокать.
- Юнит login-route: валидный токен → кука сессии (мок issueServerSession или encode) + redirect `/`; невалидный → `/?auth=failed` + `recordTelegramLoginFailure`.
- Юнит восстановленных `createTelegramPreauthToken`/`consumeTelegramPreauthToken` (как было до B1).
- E2E: реальный путь через приложение Telegram автотестом не покрывается (нужен живой Telegram) — проверяется владельцем на проде. Login-route можно проверить юнитом.

## Релиз (поэтапный, по плану владельца)

1. Реализация в ветке `feat/telegram-bot-login`, коммит. В main НЕ мержить.
2. Добавить env `TELEGRAM_WEBHOOK_SECRET`; promote сборку ветки на **боевой домен**; вызвать `setWebhook` на боевой домен.
3. Владелец тестит на проде (Chrome iOS, Safari iOS, desktop).
4. Ок → merge в main → main едет на прод штатно (вебхук уже смотрит на боевой домен, не меняется).

**Нюанс:** у бота только один вебхук — поэтому тестируем через promote-ветки-на-прод (боевой домен), не на preview-URL.

## Что НЕ трогаем
- `oauth.telegram.org`-виджет остаётся как fallback (пока).
- Google One Tap, magic-link, B1-серверная сессия — без изменений.
- Новой миграции БД нет (таблица токенов уже в проде).
