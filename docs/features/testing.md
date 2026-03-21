# Система тестирования

## Обзор

Проект использует трёхуровневую систему тестирования:

| Уровень | Инструмент | Когда запускается | Время |
|---------|-----------|-------------------|-------|
| Lint + Typecheck | ESLint + tsc | До пуша (Husky) и в CI | ~10 сек |
| Unit-тесты | Jest | До пуша (Husky) и в CI | ~6 сек |
| E2E-тесты | Playwright | Только в CI после пуша | ~5-10 мин |

---

## Unit-тесты (Jest)

**Запуск:** `npm test`

**Расположение:** рядом с тестируемым файлом (`route.test.ts`, `Component.test.tsx`)

**Покрытие:** 38 файлов, ~328 тест-кейсов

Покрывают:
- Все API route handlers (`app/api/**/*.test.ts`)
- Ключевые компоненты (`components/nd/*.test.tsx`)
- Lib-функции (`lib/*.test.ts`)

**Coverage threshold** (только для `lib/`): 80% lines и functions. Проверяется командой `npm test -- --coverage`.

### Особенности

- `@jest-environment node` для route handlers (не jsdom)
- `@jest-environment jsdom` для React-компонентов
- Моки для `@/lib/db`, `@/lib/auth`, `next/navigation`
- Компоненты с `useRouter` требуют мока:
  ```ts
  jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), refresh: jest.fn() })
  }))
  ```

---

## E2E-тесты (Playwright)

**Запуск:** `npm run test:e2e` (требует запущенного dev-сервера)

**Расположение:** `e2e/*.spec.ts`

**Браузер:** Chromium (headless)

### Запуск локально

```bash
# Запустить dev-сервер с тестовым режимом
NEXTAUTH_TEST_MODE=true npx next dev

# В другом терминале
npm run test:e2e
```

> `reuseExistingServer: true` в `playwright.config.ts` — если сервер уже запущен, Playwright использует его.

### Тестовый режим (`NEXTAUTH_TEST_MODE=true`)

Специальные API-эндпоинты, доступные только в тестовом режиме:

| Эндпоинт | Назначение |
|----------|-----------|
| `POST /api/test/session` | Создать сессию без OAuth (поддерживает `isAdmin`, `telegramUsername`) |
| `DELETE /api/test/session` | Удалить пользователя и сессию |
| `POST /api/test/signup` | Записать signup напрямую в Google Sheets |
| `DELETE /api/test/signup` | Пометить запись как TO DELETE в Sheets |

В этом режиме:
- `lib/sheets.ts` возвращает фикстурные книги (`TEST_BOOKS`) без обращения к Google Sheets
- `lib/signups.ts` (`upsertSignup`) пропускает запись в Sheets
- Фикстурные книги для тестов: `__test_book_1__` / `__test_book_2__` / `__test_book_3__` (см. `lib/books-with-covers.ts`)

### Покрытие E2E

| Файл | Что тестирует |
|------|--------------|
| `auth.spec.ts` | Видимость кнопки входа, состояние после логина |
| `telegram-auth.spec.ts` | Авторизация через Telegram, профиль с @username |
| `signup.spec.ts` | Регистрация, ContactsForm, персистенция |
| `profile.spec.ts` | ProfileDrawer: редактирование имени, языки чтения |
| `admin.spec.ts` | Редиректы для не-админов |
| `admin-delete-user.spec.ts` | Удаление пользователя в AdminPanel |
| `admin-book-status.spec.ts` | Изменение статуса книги, SEC-проверка 403 |
| `book-card.spec.ts` | Разворачивание описания книги |
| `search.spec.ts` | Поиск и фильтрация |
| `priority-hint.spec.ts` | Тост с подсказкой о приоритетах |
| `submit-book.spec.ts` | Форма предложения книги |
| `theme.spec.ts` | Переключение темы |
| `view-mode.spec.ts` | Режимы отображения (сетка/список) |
| `ui-states.spec.ts` | CSS-поведение: скрытие, позиционирование |

### Правила написания E2E-тестов

**Всегда** использовать `page.waitForLoadState('networkidle')` перед взаимодействием с client-side компонентами.

**Тест на персистенцию обязан** делать `page.reload()` и проверять состояние заново:
```ts
await action()
await page.reload()
await page.waitForLoadState('networkidle')
await expect(result).toBeVisible() // проверка после reload
```

**ContactsForm** открывается автоматически для залогиненных пользователей без профиля — заполнять её до взаимодействия с остальным UI.

**Для обхода ContactsForm** в тестах использовать `telegramUsername` в сессии:
```ts
await page.request.post('/api/test/session', {
  data: { email, name, telegramUsername: 'test_user' }
})
```

**Модальные компоненты** должны иметь `role="dialog"` для поиска в тестах.

---

## Allure-отчёт

После каждого CI-прогона автоматически публикуется отчёт:

**URL:** `https://bon2362.github.io/book-club/`

Содержит:
- Результаты каждого теста (passed/failed/skipped)
- Скриншоты при падении
- Трейсы (trace.zip) для воспроизведения ошибки
- Трендовый график последних 30 прогонов

---

## CI/CD

Описан в `.github/workflows/ci.yml`. Запускается после каждого пуша в `main`.

**Порядок шагов:**
```
git push → GitHub Actions
  1. npm ci
  2. lint
  3. typecheck
  4. unit-тесты (с DATABASE_URL=dummy)
  5. install playwright chromium
  6. e2e-тесты (с реальной БД и Google Sheets)
  7. allure generate → publish to gh-pages
  8. build
```

**E2E в CI требуют секреты:**
- `DATABASE_URL` — Neon Postgres
- `GOOGLE_SERVICE_ACCOUNT_KEY` — JSON сервисного аккаунта Google
- `GOOGLE_SHEETS_ID` — ID таблицы

---

## Husky (pre-commit)

`lint-staged` запускается автоматически перед каждым коммитом:
- ESLint на изменённых `.ts/.tsx` файлах
- `tsc --noEmit` на изменённых `.ts/.tsx` файлах

Если lint или typecheck упали — коммит не создаётся.

---

## Чеклист перед коммитом

1. `npm run lint` — нет ошибок
2. `npm run typecheck` — нет ошибок
3. `npm test` — все unit-тесты зелёные
4. Явно написать: **"E2E: нужен / не нужен — [причина]"**

E2E нужен если:
- Новый UI-флоу (форма, модал, навигация)
- Действие меняет персистентное состояние (signup, delete, profile)
- Условный рендер по бизнес-логике
- Изменение auth-цепочки
- CSS-поведение (скрытие, анимации — добавлять в `e2e/ui-states.spec.ts`)
