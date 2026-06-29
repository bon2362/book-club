# Система обеспечения качества

## Обзор

Качество обеспечивается на нескольких независимых уровнях: от статического анализа до e2e-тестов в CI с отчётностью. Каждый уровень ловит свой класс ошибок.

| Уровень | Инструмент | Запускается | Время |
|---------|-----------|-------------|-------|
| Статический анализ | ESLint + tsc | Pre-commit (Husky) + CI | ~10 сек |
| Unit-тесты + Coverage | Jest + Codecov | Pre-commit (Husky) + CI | ~45 сек |
| E2E-тесты | Playwright | CI (после пуша) | ~5–10 мин |
| Отчётность | Allure + GitHub Pages | CI (после e2e) | авто |
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

**42 test-суита, 400 тест-кейсов** (по состоянию на март 2026).

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

**Запуск:** `npm run test:e2e` (требует запущенного dev-сервера)

Сценарии, проверяющие cookie с обязательным префиксом `__Secure-`, локально запускаются через HTTPS: `PLAYWRIGHT_HTTPS=true npm run test:e2e <spec>`. Конфиг добавляет `next dev --experimental-https` и разрешает только локальный self-signed certificate; CI и production-настройки не ослабляются.

**14 спеков, браузер: Chromium headless.**

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

Global setup/teardown удаляет E2E users и E2E matching sessions через `/api/test/cleanup-users`; per-test login fixtures не удаляют пользователей, чтобы не ломать session cookies и FK во время suite.

### Покрытие E2E

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
| `book-card.spec.ts` | Каталог книг | Разворачивание описания книги |
| `search.spec.ts` | Каталог книг | Поиск и фильтрация |
| `priority-hint.spec.ts` | Каталог книг | Тост с подсказкой о приоритетах |
| `submit-book.spec.ts` | Каталог книг | Форма предложения книги |
| `theme.spec.ts` | UI | Переключение темы |
| `view-mode.spec.ts` | UI | Режимы отображения (сетка/список) |
| `ui-states.spec.ts` | UI | CSS-поведение: скрытие header при скролле |
| `matching-satisfaction.spec.ts` | Матчинг | Disclosure и глобальное имя, Ranking Gate, подтверждение с reload, видимость статуса, закрепление и observer-mode |
| `matching-realtime.spec.ts` | Матчинг | Polling public state по `state_version` и реальные display names без raw user ids |

Matching E2E создают минимум двух пользователей и собственную active session. Проверки персистентности подтверждения обязательно делают `page.reload()`. Удаление тестовой книги сначала очищает связанные locked circles, поскольку production FK намеренно запрещает удалить книгу из закреплённого результата.

### Правила написания E2E-тестов

**Ждать гидрации React** перед взаимодействием с client-side компонентами:
```ts
await page.waitForLoadState('networkidle')
```

**Тест на персистенцию обязан** перезагружать страницу и проверять состояние заново:
```ts
await action()
await page.reload()
await page.waitForLoadState('networkidle')
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

E2E **никогда не пишут в прод-БД**. Три слоя защиты:

1. **Отдельная Neon-ветка `e2e`.** Параметры подключения — в `.env.test.local` (см. `.env.test.local.example`). `playwright.config.ts` грузит этот файл и пробрасывает `DATABASE_URL` в `webServer.env`, чтобы Next.js не взял прод-БД из `.env.local`.
2. **Guard в `lib/test-mode.ts`:** `/api/test/*` возвращает 403, если `DATABASE_URL` содержит `PROD_DB_HOST_MARKER` или НЕ содержит `E2E_REQUIRE_DB_MARKER` (оба маркера — в `.env.test.local`).
3. **Фикстуры в `e2e/fixtures.ts`:** любая мутация — через фикстуру (`createIntroSection`, `loginAsAdmin`), регистрирующую cleanup в teardown. Cleanup гарантирован даже при падении ассерта.

**Правило:** новый тест не редактирует существующие прод-данные — создаёт свои через фикстуру, проверяет, фикстура удаляет. Нужна новая сущность — добавь фикстуру в `e2e/fixtures.ts`, не пиши inline-cleanup в теле теста.

### Гочи запуска и взаимодействия

- `playwright.config.ts` сам прокидывает `NEXTAUTH_TEST_MODE=true` в `webServer.env`. Ручной `NEXTAUTH_TEST_MODE=true npx next dev` нужен **только** если уже запущен dev-сервер без флага (тогда `reuseExistingServer: true` его переиспользует). Лучше остановить старый dev-сервер и дать Playwright поднять свой.
- **OOM на машинах с малой памятью:** держать запущенным только один dev server. Несколько параллельных процессов (Next.js + Chrome) при нехватке памяти вызывают OOM kill сервера.
- **`session.user.id`** надо явно ставить в `session` callback (`session.user.id = token.sub`) — иначе API-эндпоинты с `auth()` вернут 401.
- **Live locators и кнопки-тогглы:** после клика кнопка «Хочу читать» меняется на «Записан» — локатор `getByRole('button', { name: /хочу читать/i })` пересчитывается. Для второго клика снова используй `.first()` (не `.nth(1)`), предварительно дождавшись появления «Записан».
- **`role="status"` конфликтует с `@dnd-kit`** — DnD kit добавляет свой `aria-live` регион с `role="status"`. Для своих тостов/статусов использовать `data-testid`.
- **Telegram auth:** при изменении auth/telegram цепочки — гонять `e2e/telegram-auth.spec.ts`. Тест использует `/api/test/session` с `telegramUsername` и `provider: 'telegram-preauth'` — отдельный mock endpoint не нужен.

### UI Layout Tests (CSS-поведение)

Задачи, затрагивающие **CSS-поведение** (скрытие, позиционирование, анимации), покрываются тестом в `e2e/ui-states.spec.ts`. **Правило: UI-задачу нельзя коммитить без такого теста.**

- Проверять `boundingBox()` элемента в нужном состоянии (виден / скрыт / сдвинут).
- **Математическое доказательство CSS-формул:** для `transform`/`position`-расчётов писать комментарий с выводом формулы (`final_pos = start_pos + transform`), проверять знак и что результат действительно за границей экрана. Это ловит ошибки, где визуально «вроде скрыто», а на деле элемент частично в кадре.
- Субагенты перед коммитом UI-задач **обязаны** прогнать:
  ```bash
  npm run lint && npm run typecheck && npm test && npm run test:e2e e2e/ui-states.spec.ts
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

Описан в `.github/workflows/ci.yml`. Запускается после каждого пуша в `main`.

```
git push → GitHub Actions
  1. npm ci
  2. lint
  3. typecheck
  4. unit-тесты + coverage (DATABASE_URL=dummy)
  5. upload coverage → Codecov
  6. install playwright chromium
  7. e2e-тесты (изолированная Neon-ветка `e2e`, книги создаются per-test через `createTestBook` фикстуру)
  8. allure generate → publish gh-pages
  9. build
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
- CSS-поведение: скрытие, анимации → добавлять в `e2e/ui-states.spec.ts`

### Перед каждым коммитом — явно написать:
> **"E2E: нужен / не нужен — [причина]"**
