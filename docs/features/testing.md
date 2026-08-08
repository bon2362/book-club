# Система обеспечения качества

## Обзор

Качество обеспечивается на нескольких независимых уровнях: от статического анализа до e2e-тестов в CI с отчётностью. Каждый уровень ловит свой класс ошибок.

| Уровень | Инструмент | Запускается | Время |
|---------|-----------|-------------|-------|
| Статический анализ | ESLint + tsc | Pre-commit (Husky) + CI | ~10 сек |
| Unit-тесты + Coverage | Jest + Codecov | Pre-commit (Husky) + CI | ~45 сек |
| E2E-тесты | Playwright | Focused локально; полный nightly/manual | focused Matching ~30 сек; полный прогон измеряется nightly |
| Отчётность | Allure + GitHub Pages | После отдельного E2E workflow | авто |
| Coverage tracking | Codecov | CI (после unit-тестов) | авто |

---

## Статический анализ

### ESLint

Конфиг: `eslint.config.mjs`. Запуск: `npm run lint`.

Проверяет импорты, неиспользуемые переменные, React-специфичные правила. `--max-warnings 0` — любое предупреждение считается ошибкой.

### TypeScript

`npm run typecheck` (`tsc --noEmit`). Проверяет типы по всему проекту без сборки.

### Pre-commit (Husky + lint-staged)

Перед каждым коммитом `lint-staged` автоматически прогоняет ESLint и tsc на изменённых `.ts/.tsx` файлах. Коммит не создаётся при ошибках.

> **Ограничение devcontainer:** `tsc --noEmit` на полном проекте OOM-ит из-за нехватки памяти (~1.5 GB). В этом случае запускать проверку вручную: `npm run lint && npx tsc --noEmit <изменённые_файлы>`, коммитить с `--no-verify`. CI на GitHub Actions всегда прогоняет полный typecheck.

---

## Unit-тесты (Jest)

**Запуск:** `npm test`

Количество suite и тестов растёт; актуальное значение показывает итог `npm test`.

Покрывают:
- API route handlers (`app/api/**/*.test.ts`) — каждый handler тестируется с замоканными зависимостями
- React-компоненты (`components/nd/*.test.tsx`)
- Lib-функции (`lib/*.test.ts`) — особенно трансформации данных из внешних источников

**Расположение:** рядом с тестируемым файлом (`route.test.ts`, `Component.test.tsx`).

### Конфигурация

- `@jest-environment node` для route handlers (не jsdom)
- `@jest-environment jsdom` для React-компонентов
- Алиас `@/` → корень проекта
- Моки: `@/lib/db`, `@/lib/auth`, `next/navigation`

```ts
// Стандартный мок для компонентов с useRouter
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() })
}))
```

### Coverage (покрытие кода)

**Coverage threshold:** 80% lines и functions для `lib/` и `app/api/`.

```bash
npm test -- --coverage   # генерирует coverage/lcov.info
```

Исключено из coverage: DB-миграции, схема, тестовые эндпоинты, NextAuth handler.

Coverage автоматически загружается в **Codecov** в каждом CI-прогоне:
- Текущее покрытие: **~86%** функций
- Dashboard: `https://codecov.io/gh/bon2362/book-club`
- Badge отображается в README

---

## E2E-тесты (Playwright)

**Запуск:**

- `npm run test:e2e:focused -- <spec> [--grep "..."]` — затронутый flow, локально без retry;
- `npm run test:e2e:matching` — браузерные golden/layout Matching;
- `npm run test:integration:matching` — HTTP/SQL/transaction Matching без BrowserContext;
- `npm run test:e2e:nightly` — полный последовательный портфель, в CI с одним retry.

Сценарии, проверяющие cookie с обязательным префиксом `__Secure-`, локально запускаются через HTTPS: `PLAYWRIGHT_HTTPS=true npm run test:e2e <spec>`. Конфиг добавляет `next dev --experimental-https` и разрешает только локальный self-signed certificate; CI и production-настройки не ослабляются.

**Браузер: Chromium headless.** E2E не входят в merge-gate: красный nightly чинится форвардом и не отменяет уже выполненный merge.

### Запуск локально

```bash
# 1. Запустить dev-сервер с тестовым режимом
NEXTAUTH_TEST_MODE=true npx next dev

# 2. В другом терминале
npm run test:e2e
```

`reuseExistingServer: true` — Playwright переиспользует уже запущенный сервер.

Playwright запускается с `workers: 1`: matching-тесты используют единственную active session (`matching_sessions_single_active_idx`), а `/matching` всегда читает её. Параллельные спеки могут удалить или заменить active session друг у друга.

### Тестовый режим (`NEXTAUTH_TEST_MODE=true`)

Позволяет создавать сессии и управлять данными без реального OAuth. Доступные эндпоинты:

| Эндпоинт | Назначение |
|----------|-----------|
| `POST /api/test/session` | Создать сессию (поддерживает `isAdmin`, `telegramUsername`) |
| `DELETE /api/test/session` | Удалить пользователя и сессию (ручная точечная уборка; обычные fixtures оставляют users до global cleanup) |
| `POST /api/test/books` | Создать тестовую опубликованную книгу |
| `DELETE /api/test/books` | Удалить тестовую книгу |
| `POST /api/test/matching-session` | Создать активную тестовую matching-сессию |
| `DELETE /api/test/matching-session` | Удалить тестовую matching-сессию |
| `POST /api/test/signup` | Записать выбранные книги напрямую в `signup_books` |
| `DELETE /api/test/signup` | Удалить тестовые записи пользователя из `signup_books` |

Каждый E2E-тест создаёт нужные ему книги через `createTestBook` фикстуру (см. `e2e/fixtures.ts`). Id'шники имеют префикс `__e2e_book_<testId>_<index>__`, фикстура удаляет книгу в teardown (FK signup_books/book_priorities → cascade). Глобального seed-каталога больше нет — каждая спека работает только со своими данными.

Global setup/teardown удаляет E2E users и E2E matching sessions через `/api/test/cleanup-users`; per-test login fixtures не удаляют пользователей, чтобы не ломать session cookies и FK во время suite. Cleanup сносит **только хвосты старше 2 часов**: ветка `e2e` общая для CI nightly и локальных focused-прогонов, и без age-gate setup/teardown одного прогона удалял живых пользователей другого посреди теста (источник флака book-summaries в nightly 29497802469). Свежий мусор упавшего прогона доживает до следующего sweep'а — это нормально, id/email уникальны per-test.

Для matching используются две составные fixture:

- `matchingBoardFixture` создаёт отдельную active session, две книги и двух участников в независимых browser contexts, вступает ими в сессию и выставляет ранги; дополнительные участники добавляются через `addParticipant`;
- `matchingBooksFixture` создаёт открытую книжную сессию с request-only viewer и администратором. Peers B/C появляются только при вызове ленивых `getParticipantB()`/`getParticipantC()`; произвольные дополнительные участники — через `addParticipant`. Браузерная страница создаётся отдельно через `openMatchingPage`;
- `matchingApiFixture` из `e2e/api-fixtures.ts` создаёт multi-user книжный setup полностью через `APIRequestContext`; он используется для concurrency и lifecycle guards без Chromium;
- `auditCleanup` отслеживает ID тестовых sessions/users и после зависимых teardown удаляет связанные `audit_log`-строки. Она нужна потому, что глобальный audit намеренно не удаляется каскадом вместе с доменными таблицами.

Все matching-мутации выполняются только в изолированной Neon-ветке `e2e`. Fixture сначала удаляют session/books и пользовательские данные по обычным FK/cleanup-маршрутам, затем `auditCleanup` убирает оставшиеся audit snapshots; production-строки не переиспользуются и не редактируются.

### Покрытие E2E

Nightly — явная композиция трёх Playwright projects:

| Project | Состав | Browser |
|---|---|---|
| `browser-non-matching` | Все обычные browser specs, Matching исключён | да |
| `matching-golden` | Книжные тесты с тегом `@matching-golden` | да |
| `matching-integration` | `e2e/integration/matching/**` | нет |

Сценарные specs и cutover-проверки удалены вместе с runtime. Карта актуального покрытия:

| Риск | Nightly-проверка |
|---|---|
| conditional/hard/switch/reload | tagged `matching-books.spec.ts` |
| formation и assignment guards | tagged formation golden path |
| realtime polling | `MatchingRealtimeClient.test.tsx` и книжные browser journeys |
| admin close/reopen/place/assign | tagged admin lifecycle |
| focus, responsive, document scroll, formed fill | tagged book-layout tests в `matching-layout.spec.ts` |
| book board shell, popup, long-sheet close, waiting line и full width | tagged book-layout tests в `matching-layout.spec.ts` |
| concurrent threshold | `integration/matching/concurrency.spec.ts` |
| destructive scenario-removal migration: active/frozen import and rollback | `integration/matching/scenario-removal-migration.spec.ts` |
| actor-aware audit, semantic events, cleanup и heartbeat noise | книжные audit integration tests |
| assigned/closed/impersonation guards и readable state | `integration/matching/state-guards.spec.ts` |
| auth modal, welcome и close navigation | matching welcome/book journeys |
| ranking edge cases и добавление книги | ranking/rank-assignment Jest, ranking journey и live-shortlist golden |
| force-add и admin union view | admin route/session-transition/component Jest, admin lifecycle golden |

Сценарные Matching E2E удалены вместе с runtime. Nightly оставляет книжные и welcome/layout golden paths; request-only integration покрывает lifecycle, guards и конкурентность книжной модели.

Спеки структурированы по доменным областям (отражается в Allure-отчёте):

| Спек | Epic | Что тестирует |
|------|------|--------------|
| `auth.spec.ts` | Авторизация | Видимость кнопки входа, состояние после логина |
| `telegram-auth.spec.ts` | Авторизация | Авторизация через Telegram, профиль с @username |
| `signup.spec.ts` | Авторизация | Регистрация, ContactsForm, персистенция |
| `profile.spec.ts` | Профиль | ProfileDrawer: редактирование имени, языки чтения |
| `admin.spec.ts` | Администрирование | Редиректы для не-админов |
| `admin-delete-user.spec.ts` | Администрирование | Удаление пользователя в AdminPanel |
| `admin-book-status.spec.ts` | Администрирование | Изменение статуса книги, SEC-проверка 403 |
| `admin-user-book-status.spec.ts` | Администрирование | Смена personal status из карточки участника, повторное открытие drawer и персистентность после `page.reload()` |
| `book-card.spec.ts` | Каталог книг | Разворачивание описания книги |
| `search.spec.ts` | Каталог книг | Поиск и фильтрация |
| `priority-hint.spec.ts` | Каталог книг | Тост с подсказкой о приоритетах |
| `submit-book.spec.ts` | Каталог книг | Форма предложения книги |
| `timeline.spec.ts` | Лента времени | Открытие ленты по ссылке без входа, выбор события и эпохи, черновик: 404 гостю и пометка админу |
| `timeline-layout.spec.ts` | UI | Геометрия ленты: подписи событий не накладываются, подпись эпохи внутри полосы, 375 px против 1280 px |
| `theme.spec.ts` | UI | Переключение темы |
| `view-mode.spec.ts` | UI | Режимы отображения (сетка/список) |
| `*-layout.spec.ts` | UI | Доменное CSS-поведение и реальная геометрия |
| `matching-books.spec.ts` | Матчинг | Условный/твёрдый выбор с reload, атомарная смена книги, очистка условных согласий и формирование при двух hard |
| `matching-layout.spec.ts` | Матчинг / UI | Единая книжная доска без вкладок, desktop/mobile geometry, popup и меню авто-записи |

Matching E2E покрывают книжную доску, popup, выбор с reload, формирование и lifecycle. Каждый тест создаёт собственную открытую сессию и пользователей. Проверки персистентности обязательно делают `page.reload()`.

Книжные спеки запускаются после применения к изолированной Neon-ветке `e2e` миграций `0053_matching_books.sql`, `0059_remove_matching_scenarios.sql` и `0060_remove_matching_group_sizes.sql`. Nightly поддерживает Drizzle-схему до сборки и Playwright; fixtures миграции не применяют. Никогда не переключайте тесты на production URL.

### Правила написания E2E-тестов

После навигации ждите семантический root/состояние конкретного экрана. `networkidle` не является универсальным признаком гидрации и особенно дорог для polling/realtime страниц. Первый мутабельный click связывайте с ожиданием его HTTP response.

**Тест на персистенцию обязан** перезагружать страницу и проверять состояние заново:
```ts
await action()
await page.reload()
await expect(result).toBeVisible()
```

**ContactsForm** открывается автоматически для залогиненных пользователей без профиля. Для обхода использовать `telegramUsername` в сессии:
```ts
await page.request.post('/api/test/session', {
  data: { email, name, telegramUsername: 'test_user' }
})
```

**Модальные компоненты** обязаны иметь `role="dialog"` — иначе тесты не смогут их найти.

### Изоляция от прод-БД (КРИТИЧНО)

E2E **никогда не пишут в прод-БД**. Четыре слоя защиты:

1. **Отдельная Neon-ветка `e2e`.** Параметры подключения — в `.env.test.local` (см. `.env.test.local.example`). `playwright.config.ts` грузит этот файл и пробрасывает `DATABASE_URL` в `webServer.env`, чтобы Next.js не взял прод-БД из `.env.local`.
2. **Guard в `lib/test-mode.ts`:** `/api/test/*` возвращает 403, если `DATABASE_URL` содержит `PROD_DB_HOST_MARKER` или НЕ содержит `E2E_REQUIRE_DB_MARKER` (оба маркера — в `.env.test.local`).
3. **Guard прямого SQL в `lib/e2e-database-guard.ts`:** фикстуры с `dbExec` проверяют test mode, оба DB-маркера, PostgreSQL URL и production opt-in **до** создания `Pool`. Поэтому audit cleanup и другой прямой SQL не могут обойти защиту `/api/test/*`.
4. **Фикстуры в `e2e/fixtures.ts`:** любая мутация — через фикстуру (`createIntroSection`, `loginAsAdmin`), регистрирующую cleanup в teardown. Cleanup гарантирован даже при падении ассерта.

**Правило:** новый тест не редактирует существующие прод-данные — создаёт свои через фикстуру, проверяет, фикстура удаляет. Нужна новая сущность — добавь фикстуру в `e2e/fixtures.ts`, не пиши inline-cleanup в теле теста.

### Гочи запуска и взаимодействия

- `playwright.config.ts` сам прокидывает `NEXTAUTH_TEST_MODE=true` в `webServer.env`. Ручной `NEXTAUTH_TEST_MODE=true npx next dev` нужен **только** если уже запущен dev-сервер без флага (тогда `reuseExistingServer: true` его переиспользует). Лучше остановить старый dev-сервер и дать Playwright поднять свой.
- **OOM на машинах с малой памятью:** держать запущенным только один dev server. Несколько параллельных процессов (Next.js + Chrome) при нехватке памяти вызывают OOM kill сервера.
- **`session.user.id`** надо явно ставить в `session` callback (`session.user.id = token.sub`) — иначе API-эндпоинты с `auth()` вернут 401.
- **Live locators и кнопки-тогглы:** после клика кнопка «Хочу читать» меняется на «Записан» — локатор `getByRole('button', { name: /хочу читать/i })` пересчитывается. Для второго клика снова используй `.first()` (не `.nth(1)`), предварительно дождавшись появления «Записан».
- **`role="status"` конфликтует с `@dnd-kit`** — DnD kit добавляет свой `aria-live` регион с `role="status"`. Для своих тостов/статусов использовать `data-testid`.
- **Telegram auth:** при изменении auth/telegram цепочки — гонять `e2e/telegram-auth.spec.ts`. Тест использует `/api/test/session` с `telegramUsername` и `provider: 'telegram-preauth'` — отдельный mock endpoint не нужен.

### UI Layout Tests (CSS-поведение)

Задачи, затрагивающие **CSS-поведение**, покрываются тестом в доменном `e2e/*-layout.spec.ts`: `matching`, `summary`, `admin`, `catalog`, `account` или `shell`. **Правило: UI-задачу нельзя коммитить без focused-прогона затронутого теста.** Полный layout-портфель остаётся nightly.

- Проверять `boundingBox()` элемента в нужном состоянии (виден / скрыт / сдвинут).
- **Математическое доказательство CSS-формул:** для `transform`/`position`-расчётов писать комментарий с выводом формулы (`final_pos = start_pos + transform`), проверять знак и что результат действительно за границей экрана. Это ловит ошибки, где визуально «вроде скрыто», а на деле элемент частично в кадре.
- Субагенты перед коммитом UI-задач **обязаны** прогнать:
  ```bash
  npm run lint && npm run typecheck && npm test
  npm run test:e2e:focused -- e2e/<domain>-layout.spec.ts --grep "точный сценарий"
  ```

---

## Отчётность и видимость

### Allure-отчёт

После каждого CI-прогона генерируется и публикуется отчёт:

**URL:** `https://bon2362.github.io/book-club/`

- Результаты каждого теста (passed/failed/skipped)
- Группировка по Epic → Feature (Администрирование, Авторизация, Каталог книг, Профиль, UI)
- Трейсы (trace.zip) для воспроизведения упавших тестов
- Трендовый график: история последних прогонов

Теги в спеках (`epic()`, `feature()` из `allure-js-commons`) определяют структуру отчёта:
```ts
import { epic, feature } from 'allure-js-commons'

test.beforeEach(async () => {
  await epic('Каталог книг')
  await feature('Поиск')
})
```

### Codecov

Загрузка покрытия происходит в CI после unit-тестов автоматически.

- Badge в README отражает текущий % покрытия
- На каждый PR Codecov оставляет комментарий с дельтой покрытия
- Пороги: 80% project, 70% patch (снижение coverage блокирует PR)

---

## CI/CD

Merge-gate описан в `.github/workflows/ci.yml`; E2E вынесены в `.github/workflows/e2e-nightly.yml` (cron 00:00 UTC и ручной `workflow_dispatch`).

```
git push → GitHub Actions
  1. npm ci
  2. lint
  3. secret scan
  4. typecheck
  5. unit-тесты + coverage (DATABASE_URL=dummy)
  6. upload coverage → Codecov
  7. build

nightly/manual E2E → отдельный GitHub Actions workflow
  1. install playwright chromium
  2. drizzle-kit push в изолированную Neon-ветку `e2e`
  3. production build на e2e-конфигурации
  4. e2e-тесты (книги создаются per-test через fixtures)
  5. allure generate → publish gh-pages
```

**Секреты для E2E:**
- `DATABASE_URL` — Neon Postgres

**Секреты для Codecov:**
- `CODECOV_TOKEN` — токен (для публичного репо необязателен)

---

## Когда писать тесты

### Unit-тест обязателен если:
- Функция фильтрует или трансформирует данные из внешнего источника (Google Sheets, DB, API)
- Добавлен новый edge case в data-функцию (новый статус, флаг, поле)
- Функция содержит условную логику над внешними данными

### E2E-тест обязателен если:
- Новый UI-флоу (форма, модал, навигация)
- Действие меняет персистентное состояние — тест обязан включать `page.reload()` и проверку
- Условный рендер по бизнес-логике (показать/скрыть по условию)
- Изменение auth-цепочки (любой провайдер, JWT callback)
- CSS-поведение: скрытие, анимации → добавлять в доменный `e2e/*-layout.spec.ts`

### Перед каждым коммитом — явно написать:
> **"E2E: нужен / не нужен — [причина]"**
