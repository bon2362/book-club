# Авторизация

## Что делает
Пользователи могут войти через Google One Tap, Google OAuth, magic link (email) или Telegram. После входа данные сессии хранятся как JWT. Администраторы получают флаг `isAdmin`, открывающий доступ к панели администратора.

## Как работает
- **NextAuth v5** (`lib/auth.ts`) — серверная функция `auth()` используется в Server Components и API routes
- **Google One Tap** — Credentials provider (`google-one-tap`); `lib/auth.google-one-tap.ts` верифицирует JWT credential через `google-auth-library`, находит или создаёт пользователя в таблицах `users` + `user_identities`. Рендерится как `<GoogleOneTap />` на главной странице для неавторизованных пользователей. После входа используется `window.location.reload()` (не `router.refresh()`) для избежания race condition, при котором `useSession()` обновляется раньше, чем server props перерендерятся
- **Google OAuth** — стандартный provider; профиль пользователя сохраняется в `users`, а внешний Google `sub` хранится в `user_identities`
- **Magic link (Resend provider)** — отправляет ссылку для входа на 24 часа через `noreply@slowreading.club`; кастомный HTML-email в `sendMagicLinkEmail()`
- **Telegram Login (bot deep-link + поллинг, B2 — основной способ)** — вход через Telegram-бота, минуя `oauth.telegram.org` (который не работает на Chrome iOS). Используется **поллинг**, а не ссылка из бота: ссылка из бота открывалась бы во встроенном браузере Telegram, и кука сессии легла бы не в браузер пользователя. Flow: браузер генерит `nonce` (`crypto.randomUUID`), жмёт «Войти через Telegram» → открывает `https://t.me/<BOT_NAME>?start=<nonce>` в новой вкладке → начинает опрашивать `GET /api/auth/telegram/poll?nonce=<nonce>` (раз в 2с, до 2 мин). Пользователь нажимает Start → бот получает `/start <nonce>` через вебхук `POST /api/telegram/webhook` (защищён `X-Telegram-Bot-Api-Secret-Token = TELEGRAM_WEBHOOK_SECRET`) → вебхук вызывает `resolveOrCreateUserFromIdentity('telegram', ...)`, привязывает nonce к userId через `bindTelegramLoginNonce` (хэш nonce в `telegram_preauth_tokens`, TTL 5 мин), шлёт боту сообщение «✅ Готово, вернитесь в браузер». Опрос замечает привязку: `poll` вызывает `consumeTelegramPreauthToken(nonce)` → достаёт user → выдаёт session-куку через `issueServerSession` **в ответе на запрос браузера** (поэтому кука в браузере пользователя) → браузер делает `window.location.reload()` и оказывается залогинен. Настройка: после деплоя вызвать Telegram `setWebhook` с `url=<site>/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>`. Один вебхук на бота, смотрит на боевой домен.
- **Telegram Login Widget — УДАЛЁН.** Веб-виджет `oauth.telegram.org` не работал на Chrome iOS (блокировка кросс-сайт-кук на стороне Telegram). Заменён на bot deep-link и для входа (B2), и для привязки в профиле (B3); код виджета убран из `AuthModal` и `ProfileDrawer`. Роут `/api/auth/telegram/callback` (HMAC-верификация виджета) больше не используется UI. Историю и грабли виджета см. в git/ниже.
- **Флаг isAdmin** — устанавливается в `jwt` callback проверкой env-переменной `ADMIN_EMAIL`; хранится в JWT-токене, доступен как `session.user.isAdmin`
- **Стратегия сессии** — JWT (`strategy: 'jwt'`); `session.user.id = token.sub` устанавливается в `session` callback
- **Отслеживание способа входа** — источник истины по auth-identity живёт в `user_identities`: `provider`, `provider_account_id`, `email`, `telegram_username`, `last_seen_at`. `users.contacts` остаётся пользовательским контактным полем: при первом Telegram-входе оно автоматически заполняется `@username`, если Telegram вернул username и поле ещё пустое, но дальше пользователь может изменить его сам.
- **Подсказка последнего способа входа** — `BooksPage` сохраняет в `localStorage` только нормализованный `session.user.provider` (`google | telegram | email`) в ключ `slowreading.lastAuthProvider`. `AuthModal` читает его при открытии, показывает reminder-строку «В прошлый раз вы входили через …» и бейдж `Последний вход` на соответствующем способе входа, а для Google/email автоматически раскрывает вторичные способы. В памяти не хранятся имя, email, Telegram username или user id; это только UI-hint на стороне браузера.
- **Явная привязка аккаунтов** — вкладка «Профиль» показывает три канонических способа входа (Telegram, Google, почта) и статусы из `user_identities`. Последний использованный provider получает метку «последний вход». Для Telegram отображается `@username`, если Telegram вернул username; если username нет, профиль показывает нейтральное «Telegram ID привязан» без раскрытия numeric provider id. Отвязка способов входа не реализована. Google linking идёт через `POST /api/account/identities/google`: клиент получает Google Identity Services credential, сервер проверяет JWT через `verifyGoogleCredential`, затем под `withAuditContext(source='account-linking')` вызывает `linkVerifiedIdentityToUser`. Почтовая привязка идёт отдельным flow, а не через общий email sign-in: `POST /api/account/identities/email` требует активную session cookie, создаёт одноразовый token в `verificationToken` для пары `current userId + email` и отправляет Resend-письмо; callback `/api/account/identities/email/callback` снова требует активную session cookie, consume-ит token и привязывает `email:address` только если token принадлежит текущему `session.user.id`. Telegram linking идёт через бота (как и вход, B3): `POST /api/account/identities/telegram/link-start` (требует session) чеканит link-nonce, привязанный к `userId` (`createTelegramPreauthToken`); профиль открывает `t.me/<bot>?start=link_<nonce>`; вебхук по префиксу `link_` достаёт целевой `userId` (`consumeTelegramPreauthToken`) и под `withAuditContext(source='account-linking-bot')` вызывает `linkVerifiedIdentityToUser`; профиль опрашивает `/api/me`, пока Telegram не появится в способах входа. Конфликт (`IdentityConflictError`) → сообщение бота «уже привязан к другому аккаунту». Старый виджет-flow (`/api/account/identities/telegram/state`, `/callback`, `lib/account-linking-state.ts`) удалён. Если provider identity уже принадлежит другому пользователю, возвращается conflict (`409 identity_conflict` для Google или redirect `?account_link=email_conflict` / `?account_link=telegram_conflict` для email/Telegram); автоматического merge по имени/username/email нет.
- **Админское слияние дублей** — если дубли уже появились до явной привязки, администратор может слить source user в target user через `POST /api/admin/users/merge`. Слияние переносит `user_identities` и пользовательские связи, но не запускается автоматически из auth callback, чтобы не склеить разных людей по похожему имени или username.

## Race condition: ContactsForm после входа через One Tap
После входа через One Tap `useSession()` (client) обновляется раньше, чем приходят server props (`currentUser`) после `router.refresh()`. Это приводит к кратковременному открытию ContactsForm с пустыми полями. Решение: `GoogleOneTap` устанавливает `sessionStorage.setItem('reloading_after_onetap', '1')` перед `window.location.reload()`, а `BooksPage` проверяет и очищает этот флаг перед показом формы.

## Грабли (выучено на ошибках)
- **`data-onauth` (JS callback) не использовать** — Telegram дёргает callback через `eval()`, браузеры его блокируют. Только `data-auth-url`.
- **`window.onTelegramAuth` в отдельном `useEffect`** — при условном рендере (`authModalOpen && <AuthModal>`) возможна гонка. При callback-подходе ставить callback в тот же эффект, что грузит скрипт виджета.
- **`router.refresh()` после входа не обновляет серверные компоненты** (header остаётся «ВОЙТИ»). Нужен `window.location.reload()`.
- **Server-side `signIn('credentials', ...)` в GET route handler** в NextAuth v5 beta работает ненадёжно — не использовать. Для Telegram используется прямая выдача session-куки через `issueServerSession` (`lib/auth-session.ts`), которая кодирует JWT через `encode` из `@auth/core/jwt` и устанавливает куку на ответе сервера. Имя куки и salt зависят от `secure` (prod/HTTPS → `__Secure-authjs.session-token`, dev/HTTP → `authjs.session-token`); salt ВСЕГДА равен имени куки — это требование NextAuth v5.
- **`useSearchParams()` требует `<Suspense>`** (Next.js 14) — иначе сборка падает на генерации статических страниц. Оборачивать компонент с `useSearchParams()` в `<Suspense>`.
- **Telegram Login Widget:** домен в BotFather должен совпадать точно (с `www` и без — разные домены); у бота обязано быть фото профиля (иначе «Bot domain invalid»); виджет не работает без third-party cookies (incognito, Safari strict mode).

## Env vars
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — обязателен для One Tap (встраивается в client bundle во время сборки)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — для стандартного Google OAuth и серверной верификации One Tap
- `TELEGRAM_BOT_TOKEN` — для HMAC-SHA256 верификации данных Telegram-виджета и отправки сообщений ботом (`lib/telegram-bot.ts`)
- `NEXT_PUBLIC_TELEGRAM_BOT_NAME` — имя бота (без @), в deep-link: `t.me/<BOT_NAME>?start=<nonce>` (вход) и `?start=link_<nonce>` (привязка в профиле)
- `TELEGRAM_WEBHOOK_SECRET` — секрет для защиты вебхука бота (optional, нужен в prod; Telegram шлёт его заголовком `X-Telegram-Bot-Api-Secret-Token`)
- `NEXTAUTH_SECRET` — используется как fallback для `AUTH_SECRET`; при ручном использовании секрета вне NextAuth: `process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET`

## Durable-журнал провалов Telegram-входа

При неудаче верификации HMAC в `/api/auth/telegram/callback` строка пишется в таблицу `telegram_login_failures` (Postgres). Таблица содержит: `reason` (код причины из `TelegramVerifyFailReason`), `skew_seconds` (разница времени, если `auth_date` распарсился), `tg_id` / `tg_username` (из параметров Telegram, если переданы), `has_hash` (был ли hash в запросе вообще), `ip` (первый IP из заголовка `x-forwarded-for`). Запись — best-effort: ошибка БД не прерывает auth-флоу и не меняет редирект пользователя.

Журнал покрывает **стадию верификации** Telegram-входа:

- **Стадия верификации (widget callback)** — провалы HMAC-проверки в `/api/auth/telegram/callback`; `reason` из `TelegramVerifyFailReason`, `has_hash: true/false`, `tg_id`/`tg_username`/`ip` заполнены если переданы Telegram-ом.
- **Стадия bot-login (поллинг)** — отдельных записей о провалах не пишет: `poll` возвращает `pending` и для «ещё не привязан», и для истёкшего/использованного nonce (они неотличимы), браузер просто истекает по таймауту. Наблюдаемость — через серверные логи `[telegram-webhook]` (привязка/ошибка) и `[telegram-poll] ok` (выдача сессии).

Таблица **намеренно не включена в `AUDITED_TABLES`** и не имеет аудит-триггера: это диагностический/security-журнал анонимных попыток (actor неизвестен до успешного входа), аудит дал бы шум и вектор флуда. Сам журнал и есть durable-хранилище.

Записи старше 30 дней (`TELEGRAM_LOGIN_FAILURE_RETENTION_DAYS`) удаляются cron-джобой `telegram-preauth-cleanup` (schedule `0 3 * * *`). Таблица `telegram_preauth_tokens` используется для bot-login (B2); протёкшие токены удаляются тем же cron (`cleanupTelegramPreauthTokens`).

## Ключевые файлы
- `lib/auth.ts` — конфигурация NextAuth, providers, JWT/session callbacks, magic link email
- `lib/account-email-linking.ts` — одноразовые token'ы для привязки почты к текущему профилю
- `lib/auth.google-one-tap.ts` — верификация Google One Tap credential и upsert пользователя
- `lib/google-credential.ts` — общая серверная проверка Google Identity Services credential для One Tap и привязки Google
- `lib/account-linking-state.ts` — короткоживущий signed state для Telegram account linking
- `lib/admin/user-merge.ts` — admin-only merge дублей, когда identity уже оказалась в другом внутреннем user
- `app/api/account/identities/google/route.ts` — explicit linking Google identity к текущему пользователю
- `app/api/account/identities/email/route.ts` — отправляет письмо подтверждения для привязки почты к текущему пользователю
- `app/api/account/identities/email/callback/route.ts` — consume-ит email-link token и привязывает email identity к текущему пользователю
- `app/api/account/identities/telegram/state/route.ts` — выдаёт signed state и callback URL для Telegram Widget в режиме привязки
- `app/api/account/identities/telegram/callback/route.ts` — explicit linking Telegram identity к текущему пользователю через Telegram Widget redirect
- `components/nd/GoogleOneTap.tsx` — client component, рендерится на главной для неавторизованных пользователей
- `lib/db/schema.ts` — таблицы `users` (профиль и пользовательские контакты), `user_identities` (способы входа и provider-specific ids), `verificationTokens`
- `app/api/auth/[...nextauth]/route.ts` — handler NextAuth
- `lib/auth-session.ts` — `issueServerSession`: кодирует session-JWT и ставит куку сессии NextAuth на ответ сервера; имя куки и salt зависят от `secure`
- `app/api/auth/telegram/callback/route.ts` — Telegram redirect handler: верифицирует HMAC, создаёт/находит пользователя, ставит session-куку через `issueServerSession` и редиректит на главную
- `components/nd/AuthModal.tsx` — модал входа с Google, magic link и Telegram-виджетом
- `middleware.ts` / `proxy.ts` — защита роутов (редирект неавторизованных пользователей)
