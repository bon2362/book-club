# Авторизация

## Что делает
Пользователи могут войти через Google One Tap, Google OAuth, magic link (email) или Telegram. После входа данные сессии хранятся как JWT. Администраторы получают флаг `isAdmin`, открывающий доступ к панели администратора.

## Как работает
- **NextAuth v5** (`lib/auth.ts`) — серверная функция `auth()` используется в Server Components и API routes
- **Google One Tap** — Credentials provider (`google-one-tap`); `lib/auth.google-one-tap.ts` верифицирует JWT credential через `google-auth-library`, находит или создаёт пользователя в таблицах `users` + `user_identities`. Рендерится как `<GoogleOneTap />` на главной странице для неавторизованных пользователей. После входа используется `window.location.reload()` (не `router.refresh()`) для избежания race condition, при котором `useSession()` обновляется раньше, чем server props перерендерятся
- **Google OAuth** — стандартный provider; профиль пользователя сохраняется в `users`, а внешний Google `sub` хранится в `user_identities`
- **Magic link (Resend provider)** — отправляет ссылку для входа на 24 часа через `noreply@slowreading.club`; кастомный HTML-email в `sendMagicLinkEmail()`
- **Telegram Login** — использует flow с `data-auth-url` (НЕ callback `data-onauth` — Telegram использует `eval` внутри, который браузеры блокируют). Flow: виджет → `/api/auth/telegram/callback` (верифицирует HMAC, upserts пользователя, генерирует подписанный pre-auth токен) → `/auth/telegram` (client-страница вызывает `signIn('telegram-preauth', ...)`) → главная. Два Credentials provider: `telegram` (прямая HMAC-верификация, legacy) и `telegram-preauth` (валидирует краткоживущий HMAC-токен из callback route). Credentials providers НЕ используют DrizzleAdapter — пользователь должен быть вставлен вручную в `authorize` через `db.insert(users).onConflictDoUpdate(...)`. Требования BotFather: точное совпадение домена (с `www` и без — разные домены) + у бота должна быть фотография профиля
- **Флаг isAdmin** — устанавливается в `jwt` callback проверкой env-переменной `ADMIN_EMAIL`; хранится в JWT-токене, доступен как `session.user.isAdmin`
- **Стратегия сессии** — JWT (`strategy: 'jwt'`); `session.user.id = token.sub` устанавливается в `session` callback
- **Отслеживание способа входа** — источник истины по auth-identity живёт в `user_identities`: `provider`, `provider_account_id`, `email`, `telegram_username`, `last_seen_at`. `users.contacts` остаётся пользовательским контактным полем: при первом Telegram-входе оно автоматически заполняется `@username`, если Telegram вернул username и поле ещё пустое, но дальше пользователь может изменить его сам. Технический Telegram username из `user_identities` не показывается на сайте.
- **Подсказка последнего способа входа** — `BooksPage` сохраняет в `localStorage` только нормализованный `session.user.provider` (`google | telegram | email`) в ключ `slowreading.lastAuthProvider`. `AuthModal` читает его при открытии, показывает бейдж `последний способ входа` и автоматически раскрывает вторичные способы для Google/email. В памяти не хранятся имя, email, Telegram username или user id; это только UI-hint на стороне браузера.

## Race condition: ContactsForm после входа через One Tap
После входа через One Tap `useSession()` (client) обновляется раньше, чем приходят server props (`currentUser`) после `router.refresh()`. Это приводит к кратковременному открытию ContactsForm с пустыми полями. Решение: `GoogleOneTap` устанавливает `sessionStorage.setItem('reloading_after_onetap', '1')` перед `window.location.reload()`, а `BooksPage` проверяет и очищает этот флаг перед показом формы.

## Грабли (выучено на ошибках)
- **`data-onauth` (JS callback) не использовать** — Telegram дёргает callback через `eval()`, браузеры его блокируют. Только `data-auth-url`.
- **`window.onTelegramAuth` в отдельном `useEffect`** — при условном рендере (`authModalOpen && <AuthModal>`) возможна гонка. При callback-подходе ставить callback в тот же эффект, что грузит скрипт виджета.
- **`router.refresh()` после входа не обновляет серверные компоненты** (header остаётся «ВОЙТИ»). Нужен `window.location.reload()`.
- **Server-side `signIn('credentials', ...)` в GET route handler** в NextAuth v5 beta работает ненадёжно — использовать client-side `signIn` через промежуточную страницу `/auth/telegram`.
- **`useSearchParams()` требует `<Suspense>`** (Next.js 14) — иначе сборка падает на генерации статических страниц. Оборачивать компонент с `useSearchParams()` в `<Suspense>`.
- **Telegram Login Widget:** домен в BotFather должен совпадать точно (с `www` и без — разные домены); у бота обязано быть фото профиля (иначе «Bot domain invalid»); виджет не работает без third-party cookies (incognito, Safari strict mode).

## Env vars
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — обязателен для One Tap (встраивается в client bundle во время сборки)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — для стандартного Google OAuth и серверной верификации One Tap
- `TELEGRAM_BOT_TOKEN` — для HMAC-SHA256 верификации данных Telegram-виджета
- `NEXT_PUBLIC_TELEGRAM_BOT_NAME` — имя бота (без @), рендерится в `data-telegram-login` виджета
- `NEXTAUTH_SECRET` — используется как fallback для `AUTH_SECRET`; при ручном использовании секрета вне NextAuth: `process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET`

## Ключевые файлы
- `lib/auth.ts` — конфигурация NextAuth, providers, JWT/session callbacks, magic link email
- `lib/auth.google-one-tap.ts` — верификация Google One Tap credential и upsert пользователя
- `components/nd/GoogleOneTap.tsx` — client component, рендерится на главной для неавторизованных пользователей
- `lib/db/schema.ts` — таблицы `users` (профиль и пользовательские контакты), `user_identities` (способы входа и provider-specific ids), `verificationTokens`
- `app/api/auth/[...nextauth]/route.ts` — handler NextAuth
- `app/api/auth/telegram/callback/route.ts` — Telegram redirect handler: верифицирует hash, делает upsert пользователя, создаёт HMAC pre-auth токен
- `app/auth/telegram/page.tsx` — client-страница, вызывает `signIn('telegram-preauth', ...)` и редиректит на главную
- `components/nd/AuthModal.tsx` — модал входа с Google, magic link и Telegram-виджетом
- `middleware.ts` / `proxy.ts` — защита роутов (редирект неавторизованных пользователей)
