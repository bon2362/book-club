# Book Club Project

## Проект
"Долгое наступление" — сайт книжного клуба.
- **Live:** https://www.slowreading.club (резерв: https://book-club-slow-rising.vercel.app)
- **Стек:** Next.js 14, NextAuth v5, Neon Postgres + Drizzle ORM, Google Sheets, Resend, Vercel
- **Repo:** github.com/bon2362/book-club

## Управление задачами
- Задачи ведутся в **GitHub Issues**: https://github.com/bon2362/book-club/issues
- Labels: `epic:*` (auth/ui/feature/infra/process), `priority:P1/P2/P3`, `size:XS/S/M/L`, `status:todo/in-progress/blocked`
- Перед началом задачи из бэклога — использовать skill `github-tasks` для получения issue и перевода в `status:in-progress`
- После выполнения — закрыть issue с комментарием о коммите
- Скрипт первоначальной инициализации: `.claude/scripts/setup-github-issues.sh`

## Деплой
- **Стандартный процесс: `git commit` + `git push` → Vercel автоматически деплоит и обновляет алиас** ✓
- Vercel project живёт в team `bon2362-5067s-projects`, `projectId: "prj_ZwWgPCcLf8RyrxeMJDI5zCX08dEp"`
- `book-club-slow-rising.vercel.app` добавлен как домен проекта в настройках Vercel — обновляется автоматически
- auto-alias — `book-club-lilac.vercel.app`
- При проблемах с деплоем сразу проверять статус через Vercel API

## Devcontainer: firewall и ограничения
- Firewall настроен в `.devcontainer/init-firewall.sh` — блокирует всё кроме allowlist
- Разрешены: GitHub, npmjs.org, api.anthropic.com, googleapis.com, slowreading.club, book-club-slow-rising.vercel.app, vercel.com, api.vercel.com
- Чтобы добавить новый сервис: отредактировать `init-firewall.sh`, затем Rebuild Container (Ctrl+Shift+P)
- Exit code 7 от curl = заблокировано firewall (не сетевая ошибка)
- После ребилда контейнера: Vercel-токен в auth.json сбрасывается, использовать `--token` флаг
- Firewall резолвит IP доменов при старте — Vercel CDN может отдавать с других IP (curl на vercel.app может не работать из контейнера)
- `GH_TOKEN` берётся из `/workspace/.env.local` — если `gh` не работает: `export GH_TOKEN=$(grep GH_TOKEN /workspace/.env.local | cut -d= -f2)`

## Правила работы с кодом
- Перед удалением/переименованием поля из интерфейса/типа — сначала искать все его вхождения в проекте (Grep), чтобы не пропустить дублирующие интерфейсы в других файлах
- **Перед каждым `git commit`:** убедиться что `npm run lint` и `npm run typecheck` проходят без ошибок. Husky запускает lint-staged автоматически, но лучше проверить заранее.
- **Субагенты** перед коммитом обязаны запускать: `npm run lint && npm run typecheck && npm test`

## Типичные lint-ошибки (учить на ошибках CI)
- Неиспользуемые хелперы в тестах (`makeGet`, `makeRequest` и т.п.) ломают `no-unused-vars` — удалять вместе с вызовами
- GET-хэндлеры без параметров: если роут не использует `req`, сигнатура `GET()` без аргументов, тест вызывает `GET()` без аргументов. Не добавлять `_req: NextRequest` если он не нужен — это сломает либо typecheck, либо lint
- `_` префикс не спасает от lint если переменная реально нигде не используется

## Hooks (автоматика при разработке)
Настроены в `.claude/settings.local.json`:
- **lint-on-edit** — ESLint после каждого Edit/Write `.ts/.tsx`
- **typecheck-on-edit** — tsc после каждого Edit/Write `.ts/.tsx`
- **post-git-push-ci** — ждёт результат GitHub Actions после `git push` (до 5 мин), выводит ошибки при падении
- **block-env-local** — блокирует правку `.env.local`

Husky pre-commit: запускает `lint-staged` (eslint + tsc на изменённых файлах) перед каждым коммитом.

## Unit-тесты (Jest)
- Компоненты с `useRouter` требуют мока: `jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))`
- Тесты на порядок книг: `fetchBooksWithCovers` делает `.reverse()` — `result[0]` это последняя книга из sheets, не первая

## E2E-тесты (Playwright)
- **Dev server запускать только через Playwright** (`npm run playwright test`), не вручную — иначе `NEXTAUTH_TEST_MODE=true` не будет выставлен и `/api/test/session` вернёт 403
- `reuseExistingServer: true` в playwright.config.ts — если сервер уже запущен, Playwright его переиспользует (без нужных env vars)
- **`waitForLoadState('networkidle')`** — надёжный способ дождаться React-гидрации в Next.js перед взаимодействием с client-side компонентами
- **ContactsForm** автоматически открывается для залогиненных пользователей без профиля (`isLoggedIn && !currentUser && !savedUser`) — её оверлей перехватывает все клики, поэтому в тестах сначала заполняй форму, потом взаимодействуй с остальным UI
- Все модальные компоненты должны иметь `role="dialog"` и обработчик Escape — иначе тесты не смогут их найти и закрыть
- `session.user.id` нужно явно устанавливать в `session` callback (`session.user.id = token.sub`) — без этого API-эндпоинты с `auth()` вернут 401
- **Live locators и кнопки-тогглы**: после клика кнопка "Хочу читать" меняется на "Записан" — локатор `getByRole('button', { name: /хочу читать/i })` пересчитывается. Для второго клика используй `.first()` снова (не `.nth(1)`), предварительно дождавшись появления "Записан"
- **`role="status"` конфликтует с `@dnd-kit`** — DnD kit добавляет свой `aria-live` регион с `role="status"`. Для уникальной идентификации собственных тостов/статусов использовать `data-testid`
- **Тестовые фикстуры книг**: в `NEXTAUTH_TEST_MODE` в Google Sheets может быть мало данных. Фикстурные книги добавлены в `lib/books-with-covers.ts` (`__test_book_1__` и др.) — они появляются только в тестовом окружении

## UI Layout Tests (Playwright)

Для задач, затрагивающих CSS-поведение (скрытие, позиционирование, анимации):
- Добавить тест в `e2e/ui-states.spec.ts` с проверкой `boundingBox()` элемента в нужном стейте
- Субагент не может коммитить UI-задачу без этого теста
- Запуск: `npm run playwright test e2e/ui-states.spec.ts`

**Субагенты перед коммитом UI-задач обязаны запускать:**
`npm run lint && npm run typecheck && npm test && npm run playwright test e2e/ui-states.spec.ts`

**Математическое доказательство CSS-формул:**
Для transform/position расчётов — писать комментарий с выводом формулы:
`final_pos = start_pos + transform` → проверить знак, что результат за границей экрана.

## E2E-тесты: чеклист перед коммитом

Перед каждым коммитом — задать себе вопрос: **нужно ли добавить или обновить e2e-тесты?**

Признаки что тест нужен:
- Новый UI-флоу (форма, модал, навигация, переход между состояниями)
- CSS-поведение (скрытие, анимация, позиционирование — см. UI Layout Tests выше)
- Изменение существующего флоу, который уже покрыт e2e-тестом

Если неочевидно — **спросить пользователя** перед коммитом.

**Обязательно:** перед каждым `git commit` явно написать в ответе: _"E2E: нужен / не нужен — [причина]"_. Это видимый артефакт, который не даёт пропустить чеклист молча.

## Telegram-авторизация: архитектура и уроки

### Итоговая архитектура (правильная)
1. Виджет с `data-auth-url="/api/auth/telegram/callback"` — Telegram редиректит с данными
2. Route handler верифицирует HMAC, создаёт пользователя в БД, создаёт подписанный pre-auth токен
3. Редирект на `/auth/telegram?uid=...&token=...&ts=...`
4. Client страница вызывает `signIn('telegram-preauth', ...)` — провайдер валидирует токен, возвращает юзера

### Чего НЕ делать (и почему)
- **`data-onauth` (JS callback)** — Telegram вызывает callback через `eval()`, который браузеры блокируют. Всегда использовать `data-auth-url`.
- **Отдельный `useEffect` для `window.onTelegramAuth`** — при условном рендере (`authModalOpen && <AuthModal>`) была потенциальная гонка. Если используется callback-подход — ставить callback в тот же эффект, что загружает скрипт.
- **`router.refresh()` после auth** — не обновляет серверные компоненты (header остаётся "ВОЙТИ"). Нужен `window.location.reload()`.
- **Server-side `signIn('credentials', ...)` в GET route handler** — в NextAuth v5 beta не работает надёжно. Использовать client-side `signIn` через промежуточную страницу.

### Credentials провайдер + DrizzleAdapter
`Credentials` провайдер **не создаёт пользователей в БД автоматически** — это делает только адаптер для OAuth (Google). JWT callback `if (existing.length === 0) return null` убивает сессию. Решение: `db.insert(users).onConflictDoUpdate(...)` внутри `authorize`.

### ENV vars
`NEXTAUTH_SECRET` (старое название) и `AUTH_SECRET` (NextAuth v5) — в этом проекте задан `NEXTAUTH_SECRET`. При ручном использовании секрета за пределами NextAuth: `process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET`.

### Next.js 14: `useSearchParams()` требует `<Suspense>`
Всегда оборачивать компонент с `useSearchParams()` в `<Suspense>` — иначе сборка падает при генерации статических страниц.

### Требования Telegram Login Widget
- Домен в BotFather должен совпадать **точно** с доменом сайта (с `www` или без — разные домены)
- Бот **обязан иметь фото профиля** — без него виджет падает с "Bot domain invalid"
- Виджет не работает без third-party cookies (incognito, Safari strict mode)

## Архитектура обложек
- Обложки берутся напрямую из **колонки L Google Sheets** (`coverUrl` = `row[11]`)
- `lib/covers.ts` удалён (был Google Books API + DB cache — убран из-за 429 rate limits)
- `lib/books-with-covers.ts` — просто маппит данные из sheets, без фетча
- `lib/sheets.ts` — читает `coverUrl` из колонки L таблицы
- `CoverImage.tsx` — client component, fallback на инициалы автора при `coverUrl=null`
- `BookCard.tsx` — кнопка «Читать далее» / «Свернуть» для описаний > 120 символов
- Чтобы обложки появились — нужно заполнить колонку L в Google Sheets вручную

## Документация по фичам
`docs/features/` — краткое описание реализации каждой области (auth, books-catalog, admin-panel, notifications, user-profile). Читай перед работой с соответствующим кодом.

## Ключевые файлы
- `lib/books-with-covers.ts` — pass-through из sheets
- `lib/sheets.ts` — Google Sheets (каталог книг + coverUrl из колонки L)
- `components/nd/CoverImage.tsx` — client component, onError fallback
- `components/nd/BookCard.tsx` — expand/collapse описания
- `lib/db/schema.ts` — схема БД: users, accounts, sessions, bookPriorities и др. Таблица book_covers есть, но для обложек не используется (обложки из Google Sheets)
