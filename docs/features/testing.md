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

**14 спеков, браузер: Chromium headless.**

### Запуск локально

```bash
# 1. Запустить dev-сервер с тестовым режимом
NEXTAUTH_TEST_MODE=true npx next dev

# 2. В другом терминале
npm run test:e2e
```

`reuseExistingServer: true` — Playwright переиспользует уже запущенный сервер.

### Тестовый режим (`NEXTAUTH_TEST_MODE=true`)

Позволяет создавать сессии и управлять данными без реального OAuth. Доступные эндпоинты:

| Эндпоинт | Назначение |
|----------|-----------|
| `POST /api/test/session` | Создать сессию (поддерживает `isAdmin`, `telegramUsername`) |
| `DELETE /api/test/session` | Удалить пользователя и сессию |
| `POST /api/test/signup` | Записать signup напрямую в Google Sheets |
| `DELETE /api/test/signup` | Пометить запись как TO DELETE в Sheets |

В этом режиме `lib/sheets.ts` возвращает фикстурные книги (`__test_book_1__`, `__test_book_2__`, `__test_book_3__`) без обращения к Google Sheets.

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
  7. e2e-тесты (реальная БД + Google Sheets)
  8. allure generate → publish gh-pages
  9. build
```

**Секреты для E2E:**
- `DATABASE_URL` — Neon Postgres
- `GOOGLE_SERVICE_ACCOUNT_KEY` — JSON сервисного аккаунта Google
- `GOOGLE_SHEETS_ID` — ID таблицы

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
