# Book Club Project

## Проект
"Долгое наступление" — сайт книжного клуба.
- **Live:** https://www.slowreading.club (резерв: https://book-club-slow-rising.vercel.app)
- **Стек:** Next.js 14, NextAuth v5, Neon Postgres + Drizzle ORM, Resend, Vercel
- **Repo:** github.com/bon2362/book-club

## Управление задачами
- Задачи ведутся в **GitHub Issues**: https://github.com/bon2362/book-club/issues
- Labels: `epic:*` (auth/ui/feature/infra/process), `priority:P1/P2/P3`, `size:XS/S/M/L`, `status:todo/in-progress/blocked`
- Перед началом задачи из бэклога — использовать skill `github-tasks` для получения issue и перевода в `status:in-progress`
- После выполнения — закрыть issue с комментарием о коммите
- Скрипт первоначальной инициализации: `.claude/scripts/setup-github-issues.sh`

## Workflow: PR flow с CI-gate

**Прямой push в `main` запрещён.** Любое изменение идёт через Pull Request, который автомержится после зелёного CI. Branch protection настроена на ветке `main` (см. `gh api repos/bon2362/book-club/branches/main/protection`).

### Стандартный цикл
```bash
git checkout -b fix/коротко-о-чём        # имя ветки в kebab-case
# ... делаешь изменения, локально lint/typecheck проходят ...
git commit -am "тип: что"                 # Husky запустит lint-staged + secretlint
git push -u origin fix/коротко-о-чём
gh pr create --fill                       # title/body заполнятся из коммита
gh pr merge --auto --squash --delete-branch
# Дальше — CI крутится 4-5 минут → squash-merge в main → Vercel деплоит prod
```

Для совсем быстрых правок есть shell-функция `qpr "msg"` (если настроен алиас) — объединяет всё в одну команду.

### Что гарантирует CI-gate
- Прод **не задеплоится**, если упали: lint, secret scan, typecheck, unit-tests, E2E, build.
- `gh pr merge --auto` — мерж происходит автоматически в момент когда CI станет зелёным; не надо сидеть и кликать.
- Vercel preview каждой feature-ветки публикуется на уникальном URL (виден в PR).
- **`strict: true`** в branch protection: PR обязан быть up-to-date с main перед мержем. Если другой PR смержился раньше — GitHub потребует `gh pr update-branch`, CI перезапустится на актуальной комбинации. Это закрывает дыру «два PR от одного base, оба зелёные по отдельности, но сломанные вместе». Особенно важно при параллельной работе нескольких агентов.

### Emergency push
`enforce_admins: true` — gate работает **и для админа**. `git push origin main` отказывается даже у владельца репо. Это намеренно: «можно обойти» = «когда-нибудь обойдётся случайно».

Если прод реально лежит и фикс должен уйти срочно:
```bash
# 1. Снять защиту (~5 секунд)
gh api repos/bon2362/book-club/branches/main/protection -X DELETE

# 2. Сделать прямой push с фиксом
git push origin main

# 3. ВЕРНУТЬ защиту обратно — иначе следующий случайный коммит уйдёт без CI
gh api repos/bon2362/book-club/branches/main/protection -X PUT --input - <<'JSON'
{
  "required_status_checks": {"strict": false, "checks": [{"context": "ci"}]},
  "enforce_admins": true,
  "required_pull_request_reviews": {"required_approving_review_count": 0, "dismiss_stale_reviews": false, "require_code_owner_reviews": false},
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": false,
  "required_linear_history": false
}
JSON
```

Шаг 3 ВАЖЕН. Поставь напоминание сразу после шага 1.

### Правила для агентов (Claude, Codex)

Когда коммитишь от имени пользователя — следуй PR-flow, не пытайся срезать углы. Эти правила возникли из реальных косяков, не из общих соображений.

1. **Каждое изменение через ветку.** Никаких прямых коммитов в main, даже если кажется тривиальным. Включая «проверочные» коммиты — они тоже делаются в `test/...` ветке и закрываются без мержа.

2. **После `gh pr merge --auto` не блокируй пользователя.** Сообщи, что PR создан и auto-merge включён, и продолжай работу или верни управление. Не сиди в `gh run watch` 5 минут, если пользователь явно не попросил дождаться.

3. **CI упал — фикс в ту же PR-ветку, не новую.** Не создавай ещё один PR на тот же логический change. Push фикс-коммит, CI перезапустится, auto-merge подхватит.

4. **Direct push в main невозможен.** Даже admin-токен блокируется `enforce_admins: true`. Не трать время на попытки — сразу через PR. Если получаешь `GH006: Protected branch update failed` — это норма, не баг.

5. **Не снимай branch protection без явного согласия пользователя.** Emergency-процедура (`gh api ... -X DELETE`) — только когда прод лежит и пользователь это подтвердил. Не для удобства разработки.

6. **`--no-verify` запрещён.** Husky pre-commit (lint + secretlint) — твоя проверка качества. CI secret scan ловит то же самое позже, но коммит уже в истории git — секрет утёк, даже если поймали.

7. **Проверь осиротевшие ветки в начале сессии.** Пользователь работает то с Claude, то с Codex — другой агент мог оставить незакрытый PR. Перед началом: `gh pr list` и `git branch --remote | grep -v main`. Если есть feature-ветки без открытого PR или зависший PR — спроси у пользователя, что с ним делать (продолжить, домержить, закрыть).

8. **PR заблокирован «out of date with base branch» — подтяни main, не создавай новый PR.** Branch protection требует `strict: true`: PR должен быть up-to-date с main перед мержем. Если другой агент смержился раньше тебя, GitHub откажется мержить твой PR, пока не подтянешь свежий main. Делается одной командой:
   ```bash
   gh pr update-branch <pr-number>      # GitHub сделает merge main → твоя ветка
   # или вручную:
   # git fetch origin main && git rebase origin/main && git push --force-with-lease
   ```
   После этого CI перезапустится на актуальной комбинации (свежий main + твой diff). Когда зелёный — auto-merge сработает. Это нормальный путь параллельной работы нескольких агентов, не баг.

## Деплой (через PR-merge)
- После merge PR в `main` Vercel автоматически деплоит в production. Это не меняется.
- Vercel project: team `bon2362-5067s-projects`, `projectId: "prj_ZwWgPCcLf8RyrxeMJDI5zCX08dEp"`.
- `book-club-slow-rising.vercel.app` добавлен как домен проекта — обновляется автоматически.
- auto-alias: `book-club-lilac.vercel.app`.
- При проблемах с деплоем — статус через Vercel API.

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

Husky pre-commit запускает `lint-staged` перед каждым коммитом:
- **eslint + tsc** на изменённых `.ts/.tsx`
- **secretlint** на всех staged-файлах (`.secretlintrc.json`) — блокирует коммит если найден database connection string, AWS key, GitHub token и др. Это hard-защита от утечек секретов в публичный репо (поверх правила «не встраивать секреты в bash-команды» из общих инструкций).

Если secretlint ругается на легитимный плейсхолдер (например `dummy:dummy@dummy/dummy` в CI fixture) — добавить точечный allow-паттерн в `.secretlintrc.json`, не глобально отключать правило.

## Unit-тесты (Jest)
- Компоненты с `useRouter` требуют мока: `jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))`
- Тесты на порядок книг: каталог читается из таблицы `books`; порядок задаётся `sort_order` / `published_at`, а не Google Sheets.

## E2E-тесты (Playwright)

### Изоляция от прод-БД (КРИТИЧНО)
E2E **никогда не должны писать в прод-БД**. Архитектура защиты — три слоя:

1. **Отдельная Neon-ветка `e2e`**. Параметры подключения лежат в `.env.test.local` (см. `.env.test.local.example`). `playwright.config.ts` грузит этот файл и пробрасывает `DATABASE_URL` в `webServer.env`, чтобы Next.js не использовал прод-БД из `.env.local`.
2. **Guard в `lib/test-mode.ts`**: `/api/test/*` возвращает 403 если `DATABASE_URL` содержит `PROD_DB_HOST_MARKER` или НЕ содержит `E2E_REQUIRE_DB_MARKER`. Оба маркера задаются в `.env.test.local`.
3. **Фикстуры в `e2e/fixtures.ts`**: любая мутация — через фикстуру (`createIntroSection`, `loginAsAdmin`), которая регистрирует cleanup в teardown. Cleanup гарантирован даже при падении ассерта.

**Правило**: новый E2E-тест не редактирует существующие записи прод-данных. Создаёт свои через фикстуру, проверяет, фикстура удаляет. Если для теста нужна новая сущность — добавь фикстуру в `e2e/fixtures.ts`, не пиши inline-cleanup в теле теста.

### Запуск
- `playwright.config.ts` сам прокидывает `NEXTAUTH_TEST_MODE=true` в `webServer.env`. Ручной `NEXTAUTH_TEST_MODE=true npx next dev` нужен **только** если уже запущен dev-сервер без флага (тогда `reuseExistingServer: true` переиспользует его). Лучше остановить ранее запущенный dev-сервер и дать Playwright поднять свой.
- **OOM на машинах с малой памятью**: держать запущенным только один dev server. Несколько параллельных процессов (Next.js + Chrome) при нехватке памяти вызывают OOM kill сервера.
- **`waitForLoadState('networkidle')`** — надёжный способ дождаться React-гидрации в Next.js перед взаимодействием с client-side компонентами
- **ContactsForm** автоматически открывается для залогиненных пользователей без профиля (`isLoggedIn && !currentUser && !savedUser`) — её оверлей перехватывает все клики, поэтому в тестах сначала заполняй форму, потом взаимодействуй с остальным UI
- Все модальные компоненты должны иметь `role="dialog"` и обработчик Escape — иначе тесты не смогут их найти и закрыть
- `session.user.id` нужно явно устанавливать в `session` callback (`session.user.id = token.sub`) — без этого API-эндпоинты с `auth()` вернут 401
- **Live locators и кнопки-тогглы**: после клика кнопка "Хочу читать" меняется на "Записан" — локатор `getByRole('button', { name: /хочу читать/i })` пересчитывается. Для второго клика используй `.first()` снова (не `.nth(1)`), предварительно дождавшись появления "Записан"
- **`role="status"` конфликтует с `@dnd-kit`** — DnD kit добавляет свой `aria-live` регион с `role="status"`. Для уникальной идентификации собственных тостов/статусов использовать `data-testid`
- **Тестовые фикстуры книг**: каждый тест создаёт свои книги через `createTestBook` фикстуру (см. `e2e/fixtures.ts`). id'шники имеют префикс `__e2e_book_<testId>_<index>__`, фикстура удаляет книгу в teardown (FK signup_books/book_priorities → cascade). Глобального seed больше нет.

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

## Тесты: обязательные случаи

### Unit-тест обязателен если:
- Функция **фильтрует или трансформирует** данные из внешнего источника (Google Sheets, DB, API)
- Добавлен новый **edge case** в существующую data-функцию (новый статус, флаг, поле)
- Функция содержит **условную логику** (if/filter/map) над данными из внешнего источника

### E2E-тест обязателен если:
- Новый **UI-флоу** (форма, модал, навигация, переход между состояниями)
- Действие меняет **персистентное состояние** (signup, delete, profile edit) — тест обязан включать **перезагрузку страницы** и проверку что состояние сохранилось
- **Условный рендер** компонента по бизнес-логике (показать/скрыть по условию входа, роли, данным)
- Изменение **auth chain** (любой провайдер, JWT callback, session callback) — проверить что нужные поля присутствуют в сессии после входа
- CSS-поведение (скрытие, анимация, позиционирование — см. UI Layout Tests выше)
- Изменение существующего флоу, который уже покрыт e2e-тестом

### Правило reload
Любой тест на "действие сохраняется" должен делать `page.reload()` после действия и проверять состояние заново. Это ловит класс багов "визуально работает, но не персистится после перезагрузки".

### Telegram auth
При изменении auth/telegram цепочки — запускать E2E тест `e2e/telegram-auth.spec.ts`. Тест использует `/api/test/session` с параметрами `telegramUsername` и `provider: 'telegram-preauth'` — никакого отдельного mock endpoint не нужно.

Если неочевидно — **спросить пользователя** перед коммитом.

**Обязательно:** перед каждым `git commit` явно написать в ответе: _"E2E: нужен / не нужен — [причина]"_. Это видимый артефакт, который не даёт пропустить чеклист молча.

## E2E-тесты: чеклист перед коммитом (краткий)

Перед каждым коммитом — задать себе вопрос: **нужно ли добавить или обновить e2e-тесты?**
(полные критерии — в разделе "Тесты: обязательные случаи" выше)

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

## Архитектура каталога и обложек
- Каталог книг хранится в таблице `books` (Postgres). Чтение через `lib/books.ts`.
- Обложки: `books.cover_url`, редактируется в админской вкладке «Каталог».
- `lib/books-with-covers.ts` — backward-compat shim, re-export из `lib/books.ts`.
- `lib/sheets.ts` — DEPRECATED, остался только для `scripts/books-catalog-audit.ts`. В runtime не используется. ENV `GOOGLE_SHEETS_ID` / `GOOGLE_SERVICE_ACCOUNT_KEY` — optional.
- `CoverImage.tsx` — client component, fallback на инициалы автора при `coverUrl=null`.
- `BookCard.tsx` — кнопка «Читать далее» / «Свернуть» для описаний > 120 символов.

## Документация по фичам
`docs/features/` — краткое описание реализации каждой области (auth, books-catalog, admin-panel, notifications, user-profile). Читай перед работой с соответствующим кодом.

## Wiki-документация владельца проекта
`docs/wiki/` — исходники GitHub Wiki. На `push` в `main` workflow `.github/workflows/wiki-sync.yml` полностью синхронизирует эту папку в `bon2362/book-club.wiki.git`.

Wiki пишется для владельца проекта: без лишнего кода, но с понятными связями между фичами, БД, интеграциями, хостингом, тестами и внешними сервисами.

Перед каждым коммитом агент обязан оценить, нужна ли правка Wiki. Обновлять `docs/wiki/` обязательно, если меняются:
- пользовательская фича или админский workflow;
- БД-схема, миграции, связи данных;
- API endpoints или `public/openapi.json`;
- auth/session/provider логика;
- внешние сервисы, env vars, деплой, CI, Allure, Codecov, PostHog, Resend, Vercel, Neon;
- операционные сценарии, privacy/data handling или ресурсы проекта.

В финальном ответе перед коммитом явно писать: _"Wiki: нужна / не нужна — [причина]"_.

## Ключевые файлы
- `lib/books.ts` — чтение каталога из БД + CRUD-хелперы (`fetchBooksWithCovers`, `createBook`, `updateBook`)
- `lib/books-with-covers.ts` — re-export shim из `lib/books.ts`
- `lib/book-publish.ts` — promote approved submission → published book
- `app/api/admin/books/` — admin CRUD API
- `components/nd/AdminBooksCatalog.tsx` — админская вкладка «Каталог»
- `components/nd/CoverImage.tsx` — client component, onError fallback
- `components/nd/BookCard.tsx` — expand/collapse описания
- `lib/db/schema.ts` — схема БД: users, userIdentities, verificationTokens, books, bookPriorities и др.
