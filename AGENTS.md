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
git fetch origin main
git worktree add ../book-club-коротко-о-чём -b fix/коротко-о-чём origin/main
cd ../book-club-коротко-о-чём            # имя ветки и папки в kebab-case
# ... делаешь изменения, локально lint/typecheck проходят ...
git commit -am "тип: что"                 # Husky запустит lint-staged + secretlint
git push -u origin fix/коротко-о-чём
gh pr create --fill                       # title/body заполнятся из коммита
gh pr merge --auto --squash --delete-branch
# Дальше — CI крутится 4-5 минут → squash-merge в main → Vercel деплоит prod
```

Для совсем быстрых правок есть shell-функция `qpr "msg"` (если настроен алиас) — объединяет всё в одну команду.

### Что гарантирует CI-gate
- Прод **не задеплоится**, если упали: lint, secret scan, typecheck, unit-tests, build. **E2E в merge-gate НЕ входят** — они вынесены в отдельный workflow `.github/workflows/e2e-nightly.yml` (cron 00:00 UTC + ручной `workflow_dispatch`), не блокируют мерж. Если ночной E2E красный — GitHub уведомит, чиним форвардом. Прогнать E2E вручную: `gh workflow run "E2E (nightly)"`.
- `gh pr merge --auto` — мерж происходит автоматически в момент когда CI станет зелёным; не надо сидеть и кликать.
- Vercel preview каждой feature-ветки публикуется на уникальном URL (виден в PR).
- **`strict: true`** в branch protection: PR обязан быть up-to-date с main перед мержем. Если другой PR смержился раньше — GitHub потребует `gh pr update-branch`, CI перезапустится на актуальной комбинации. Это закрывает дыру «два PR от одного base, оба зелёные по отдельности, но сломанные вместе». Особенно важно при параллельной работе нескольких агентов.

### Emergency push
`enforce_admins: true` — gate работает **и для админа**: `git push origin main` отказывается даже у владельца репо. Это намеренно.

Аварийная процедура (снять защиту → push → вернуть защиту) применяется **только** когда прод реально лежит и пользователь подтвердил. Полные шаги с командами — `docs/emergency-push.md`.

### Правила для агентов (Claude, Codex)

Когда коммитишь от имени пользователя — следуй PR-flow из «Стандартного цикла», не пытайся срезать углы. Эти правила возникли из реальных косяков, не из общих соображений.

1. **Каждое изменение — в отдельном `git worktree` от свежего `origin/main`** (команды — см. «Стандартный цикл»). Никаких прямых коммитов в main, даже если кажется тривиальным; включая «проверочные» коммиты — они тоже делаются в `test/...` ветке и закрываются без мержа. **Не** создавай ветку в текущей папке через `git checkout -b` / `git switch -c`: текущий worktree может содержать незакоммиченную работу пользователя или другого агента. Перед правками, коммитом, пушем, `gh pr create`, `gh pr merge --auto`, `gh pr update-branch` и любыми проверками явно убедись по `pwd` / `git status --short --branch`, что находишься в task-worktree. Не stage-ь и не коммить файлы из исходного worktree. После merge PR сообщи пользователю, что папку можно удалить через `git worktree remove ../book-club-<short-task-name>`.

2. **Не блокируй пользователя синхронным `gh run watch`, но не бросай PR.** Запускай watch **через `Bash` с `run_in_background: true`** — пользователь сможет писать тебе параллельно, а ты получишь `task-notification` когда CI завершится. **Задача считается завершённой только когда PR смержен в main** (или пользователь явно сказал «оставь как есть»). На любую нотификацию о проблеме (CI failed, конфликт, BEHIND) реагируй сразу, не возвращая решение пользователю — см. правила 3, 8, 9.

3. **CI упал — фикс в ту же PR-ветку, не новую.** Не создавай ещё один PR на тот же логический change. Push фикс-коммит, CI перезапустится, auto-merge подхватит.

4. **Direct push в main невозможен.** Даже admin-токен блокируется `enforce_admins: true`. Не трать время на попытки — сразу через PR. Если получаешь `GH006: Protected branch update failed` — это норма, не баг.

5. **Не снимай branch protection без явного согласия пользователя.** Emergency-процедура (`gh api ... -X DELETE`) — только когда прод лежит и пользователь это подтвердил. Не для удобства разработки.

6. **`--no-verify` запрещён.** Husky pre-commit (lint + secretlint) — твоя проверка качества. CI secret scan ловит то же самое позже, но коммит уже в истории git — секрет утёк, даже если поймали.

7. **Проверь осиротевшие ветки в начале сессии.** Пользователь работает то с Claude, то с Codex — другой агент мог оставить незакрытый PR. Перед началом: `gh pr list` и `git branch --remote | grep -v main`. Если есть feature-ветки без открытого PR или зависший PR — спроси у пользователя, что с ним делать (продолжить, домержить, закрыть).

8. **PR заблокирован «out of date with base branch» — подтяни main сам, без спроса**, не создавай новый PR. Branch protection требует `strict: true`: PR должен быть up-to-date с main перед мержем. Если другой агент смержился раньше тебя, GitHub откажется мержить твой PR, пока не подтянешь свежий main. Это **рутина**, а не решение пользователя — не возвращай управление и не спрашивай разрешения, просто делай:
   ```bash
   gh pr update-branch <pr-number>      # GitHub сделает merge main → твоя ветка
   # или вручную:
   # git fetch origin main && git rebase origin/main && git push --force-with-lease
   ```
   После этого CI перезапустится на актуальной комбинации (свежий main + твой diff). Когда зелёный — auto-merge сработает. Если CI упал после update-branch — это нормальная диагностика конфликта логики (см. правило 3, фикс в той же ветке).

   Спрашивай пользователя только в одном случае: `gh pr update-branch` вернул conflict (Git merge conflict, не logical) и непонятно как разрешить.

9. **Сразу после `gh pr create` + `gh pr merge --auto` проверь `mergeStateStatus`.** Это единственный момент, когда некоторые проблемы видны без CI run — а если CI не стартует, тебе никогда не придёт нотификация и ты можешь решить «всё хорошо, отпускаю». Защита:
   ```bash
   gh pr view <num> --json mergeStateStatus,mergeable
   ```
   - `CLEAN` или `BLOCKED` (BLOCKED = ждёт CI, нормально) → ставь background watch на CI run (см. правило 2), оставайся в задаче.
   - `BEHIND` → `gh pr update-branch <num>` (правило 8), затем background watch.
   - `CONFLICTING` или `DIRTY` → merge conflict, CI **не запустится** сам. Резолви немедленно:
     ```bash
     git fetch origin main
     git rebase origin/main
     # резолви конфликты в редакторе, git add ., git rebase --continue
     git push --force-with-lease
     ```
     Если файлы из незнакомой области (бизнес-логика, чужая фича) и резолюция неочевидна — возвращай управление с явной пометкой «нужны твои глаза на конфликт в файлах X, Y».

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

## Аудит изменений (audit log)
- Любая новая мутабельная таблица → добавить её имя в `AUDITED_TABLES` (`lib/audit/audited-tables.ts`) **и** триггер в новой миграции (шаблон — `drizzle/0040_audit_triggers.sql`). Тест `drizzle/0040_audit_triggers.test.ts` проверяет синхронность реестра и триггеров.
- Мутации (`insert/update/delete`) идут только через `withAuditContext` (`lib/audit/with-audit-context.ts`), иначе ESLint падает. Это даёт аудиту actor. Системные пути — `source: 'cron'/'system'`, `actorUserId: null`.
- Записи с `source='trigger'` в просмотрщике = мутация прошла мимо `withAuditContext` (кроме auth-таблиц из allowlist). Это сигнал «забыли обернуть» — найти и обернуть.
- **Добавляешь/переименовываешь чувствительную колонку (токен, хэш, секрет, PII) в аудируемой таблице → добавь её в маскирование в функции `audit_capture()` (новой миграцией).** Триггер пишет всю строку в `before/after`, маскирование захардкожено (сейчас `token`, `token_hash`) — иначе секрет утечёт в журнал, видимый админам.
- Подробности: `docs/features/audit-log.md`.

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
- **cleanup-merged-worktrees** (SessionStart) — авто-чистка осиротевших sibling-воркт­ри `../book-club-*`, чьи PR смержены (ветка пушилась под своим именем и теперь удалена на origin) и в которых нет незакоммиченных изменений. Текущий воркти, `main`, харнесс-воркти в `.claude/worktrees/` и codex/superpowers-воркти не трогает. Скрипт: `.claude/hooks/cleanup-merged-worktrees.sh`, можно гонять вручную: `bash .claude/hooks/cleanup-merged-worktrees.sh`. Авто-запуск **уже подключён** через `SessionStart` в `.claude/settings.local.json` (файл локальный, в гит не коммитится).

Husky pre-commit запускает `lint-staged` перед каждым коммитом:
- **eslint + tsc** на изменённых `.ts/.tsx`
- **secretlint** на всех staged-файлах (`.secretlintrc.json`) — блокирует коммит если найден database connection string, AWS key, GitHub token и др. Это hard-защита от утечек секретов в публичный репо (поверх правила «не встраивать секреты в bash-команды» из общих инструкций).

Если secretlint ругается на легитимный плейсхолдер (например `dummy:dummy@dummy/dummy` в CI fixture) — добавить точечный allow-паттерн в `.secretlintrc.json`, не глобально отключать правило.

## Тесты

Перед **каждым** `git commit` явно написать в ответе два артефакта (видимый чеклист, чтобы не пропустить молча):
- _"E2E: нужен / не нужен — [причина]"_
- _"Wiki: нужна / не нужна — [причина]"_ (см. «Документация»)

Если неочевидно, нужен ли тест — **спросить пользователя** перед коммитом.

### Когда тест обязателен

**Unit-тест обязателен если:**
- Функция **фильтрует или трансформирует** данные из внешнего источника (Google Sheets, DB, API)
- Добавлен новый **edge case** в существующую data-функцию (новый статус, флаг, поле)
- Функция содержит **условную логику** (if/filter/map) над данными из внешнего источника

**E2E-тест обязателен если:**
- Новый **UI-флоу** (форма, модал, навигация, переход между состояниями)
- Действие меняет **персистентное состояние** (signup, delete, profile edit) — тест обязан включать **перезагрузку страницы** (`page.reload()`) и проверку что состояние сохранилось. Это ловит класс багов «визуально работает, но не персистится после перезагрузки».
- **Условный рендер** компонента по бизнес-логике (показать/скрыть по условию входа, роли, данным)
- Изменение **auth chain** (любой провайдер, JWT callback, session callback) — проверить что нужные поля присутствуют в сессии после входа
- CSS-поведение (скрытие, анимация, позиционирование — см. «UI Layout Tests»)
- Изменение существующего флоу, который уже покрыт e2e-тестом

### Unit-тесты (Jest)
- Компоненты с `useRouter` требуют мока: `jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))`
- Тесты на порядок книг: каталог читается из таблицы `books`; порядок задаётся `sort_order` / `published_at`, а не Google Sheets.

### E2E-тесты (Playwright)

**Запуск:** `npm run test:e2e` (= `playwright test`). Отдельный файл — `npm run test:e2e e2e/ui-states.spec.ts`.

**Изоляция от прод-БД (КРИТИЧНО).** E2E пишут только в изолированную Neon-ветку `e2e`; любая мутация — через фикстуру из `e2e/fixtures.ts` с cleanup в teardown, существующие прод-данные не редактируются.

Детали (3 слоя защиты, тест-режим) и гочи написания тестов — `docs/features/testing.md`. Самые частые грабли, расписанные там: live-locators и кнопки-тогглы (`.first()`, не `.nth(1)`), `role="status"`×`@dnd-kit`, ContactsForm-оверлей перехватывает клики, OOM при нескольких dev-серверах, `session.user.id` в session callback, `createTestBook`-фикстура. **Пишешь или правишь Playwright-тест — сперва прочитай этот файл.**

### UI Layout Tests
CSS-поведение (скрытие/позиционирование/анимации) — обязателен тест в `e2e/ui-states.spec.ts` (`boundingBox()`); **UI-задачу нельзя коммитить без него.** Субагент перед коммитом UI-задачи обязан прогнать `npm run lint && npm run typecheck && npm test && npm run test:e2e e2e/ui-states.spec.ts`. Как писать (boundingBox-стейты, мат-доказательство transform-формул) — `docs/features/testing.md`.

## Telegram-авторизация
Цепочка хрупкая и обросла граблями (`eval()` в виджете, `reload` vs `refresh`, Credentials без адаптера, `<Suspense>`, BotFather-домен). Архитектура, провайдеры, env vars и полный список грабель — `docs/features/auth.md`. **Трогаешь auth/telegram — сперва прочитай его, потом прогони `e2e/telegram-auth.spec.ts`.**

## Архитектура каталога и обложек
- Каталог книг хранится в таблице `books` (Postgres). Чтение через `lib/books.ts`.
- Обложки: `books.cover_url`, редактируется в админской вкладке «Каталог».
- `lib/books-with-covers.ts` — backward-compat shim, re-export из `lib/books.ts`.
- `lib/sheets.ts` — DEPRECATED, остался только для `scripts/books-catalog-audit.ts`. В runtime не используется. ENV `GOOGLE_SHEETS_ID` / `GOOGLE_SERVICE_ACCOUNT_KEY` — optional.
- `CoverImage.tsx` — client component, fallback на инициалы автора при `coverUrl=null`.
- `BookCard.tsx` — кнопка «Читать далее» / «Свернуть» для описаний > 120 символов.

## Документация

Две папки с **разной аудиторией** — не путать, темы частично пересекаются (auth, admin, books, notifications есть в обеих):

- **`docs/features/`** — техническое, code-level описание реализации каждой области (auth, books-catalog, admin-panel, notifications, infra, testing, user-profile). «Как это сделано в коде». **Читай перед работой с соответствующим кодом.**
- **`docs/wiki/`** — для **владельца проекта**, без лишнего кода: связи между фичами, БД, интеграциями, хостингом, тестами и внешними сервисами. «Что и зачем». Исходники GitHub Wiki — на `push` в `main` workflow `.github/workflows/wiki-sync.yml` полностью синхронизирует папку в `bon2362/book-club.wiki.git`.

Перед каждым коммитом агент обязан оценить, нужна ли правка Wiki, и написать артефакт _"Wiki: нужна / не нужна — [причина]"_. Обновлять `docs/wiki/` обязательно, если меняются:
- пользовательская фича или админский workflow;
- БД-схема, миграции, связи данных;
- API endpoints или `public/openapi.json`;
- auth/session/provider логика;
- внешние сервисы, env vars, деплой, CI, Allure, Codecov, PostHog, Resend, Vercel, Neon;
- операционные сценарии, privacy/data handling или ресурсы проекта.

## Ключевые файлы
- `lib/books.ts` — чтение каталога из БД + CRUD-хелперы (`fetchBooksWithCovers`, `createBook`, `updateBook`)
- `lib/books-with-covers.ts` — re-export shim из `lib/books.ts`
- `lib/book-publish.ts` — promote approved submission → published book
- `app/api/admin/books/` — admin CRUD API
- `components/nd/AdminBooksCatalog.tsx` — админская вкладка «Каталог»
- `components/nd/CoverImage.tsx` — client component, onError fallback
- `components/nd/BookCard.tsx` — expand/collapse описания
- `lib/db/schema.ts` — схема БД: users, userIdentities, verificationTokens, books, bookPriorities и др.

## Дизайн-система (канон: белый редакторский)

Весь сайт — главная, каталог, `/matching`, админка — использует **один** визуальный язык.
**Источники правды:** значения токенов — `app/globals.css` (`:root`); живая витрина примитивов — страница `/styleguide`. Перед версткой смотри `/styleguide`, не изобретай примитивы заново.

### Незыблемые правила
1. **Только токены, никаких литералов цвета.** Цвет/шрифт/линия — через `var(--…)`. Запрещены сырой hex в inline-стиле (`style={{ color: '#111' }}`) и Tailwind с **произвольным значением** (`bg-[#fde8d8]`, `text-[#...]`). Tailwind-классы из **токенов** (`className="text-accent"`, проброшены в `tailwind.config.ts`) — легитимны: разница в том, что литеральный hex запрещён, а семантический токен-класс разрешён.
2. **Острые углы.** `border-radius` = `var(--radius)` (0). Никаких `rounded-xl/lg/full`. Круг разрешён только для аватаров участников.
3. **Плоскость.** Теней нет (`--shadow-card: transparent`). Не добавлять `box-shadow` с литералами.
4. **Линия вместо заливки.** Акцент/статус — цветной линией (низ/верх/слева), а не цветным фоном. Заливка цветом — только у активной кнопки (`var(--text)`) и статусных CTA (success/accent).
5. **Шрифты.** Заголовки — `var(--nd-serif)` (Georgia). Текст/метки — `var(--nd-sans)` (system-ui). Микрометки — UPPERCASE, `letter-spacing: 0.12–0.15em`, `0.6rem`, `var(--text-muted)`.

### Токены
**Полный список токенов и их значения — в `app/globals.css` (`:root`). Не дублировать здесь** — это единственный источник правды, бери актуальные значения оттуда. Семантика: `--bg*` (фоны), `--text*` (текст по контрасту), `--accent` / `--success` (статусы), `--border*` (линии), `--nd-serif` / `--nd-sans` (шрифты), `--radius 0`, `--shadow-card transparent`.

### Стиль кода (этот репо)
Inline `style={{…}}` + `var(--…)` — канон проекта; весь `components/nd/*` написан так. Tailwind с токен-классами также легитимен (см. правило 1).

### Примитивы
**Не изобретать — копировать с `/styleguide`** (живая витрина со всеми спеками кнопок, инпутов, чипов, меток тира, карточек, аватаров). Единственное, что не видно на витрине: псевдонимы матчинга используют моно-вариант через `getPseudonymColor` из `components/nd/matching-shared.ts`.

### Чего НЕ делать
- Не возвращать пастельную палитру псевдонимов (была причиной расхождения `/matching`).
- Не вводить тёмную тему — её удалили намеренно. Нет `data-theme`, нет dark-токенов.
- Не дублировать палитру в компонентах — менять только `globals.css`.
