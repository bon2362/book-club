# Codecov + Allure теги Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подключить Codecov для загрузки Jest-покрытия в CI и добавить Allure-теги (epic/feature) во все e2e-тесты для структурированного отчёта.

**Architecture:** Две независимые части: (1) добавление шага `codecov/codecov-action` в CI workflow после шага Test; (2) добавление вызовов `epic()` и `feature()` из `allure-js-commons` в каждый e2e-спек через `test.beforeEach`.

**Tech Stack:** GitHub Actions, `codecov/codecov-action@v4`, `allure-js-commons` (уже установлен как транзитивная зависимость `allure-playwright`), TypeScript.

---

## Структура изменяемых файлов

| Файл | Действие | Что меняется |
|------|----------|--------------|
| `.github/workflows/ci.yml` | Modify | Добавить шаг upload coverage после Test |
| `codecov.yml` | Create | Конфиг Codecov (порог, комментарий к PR) |
| `e2e/admin.spec.ts` | Modify | `beforeEach`: epic Администрирование, feature Панель управления |
| `e2e/admin-book-status.spec.ts` | Modify | epic Администрирование, feature Статус книги |
| `e2e/admin-delete-user.spec.ts` | Modify | epic Администрирование, feature Удаление пользователей |
| `e2e/auth.spec.ts` | Modify | epic Авторизация, feature Вход и выход |
| `e2e/telegram-auth.spec.ts` | Modify | epic Авторизация, feature Telegram |
| `e2e/signup.spec.ts` | Modify | epic Авторизация, feature Регистрация |
| `e2e/book-card.spec.ts` | Modify | epic Каталог книг, feature Карточка книги |
| `e2e/search.spec.ts` | Modify | epic Каталог книг, feature Поиск |
| `e2e/submit-book.spec.ts` | Modify | epic Каталог книг, feature Предложить книгу |
| `e2e/priority-hint.spec.ts` | Modify | epic Каталог книг, feature Приоритеты |
| `e2e/profile.spec.ts` | Modify | epic Профиль, feature Редактирование профиля |
| `e2e/theme.spec.ts` | Modify | epic UI, feature Тема |
| `e2e/ui-states.spec.ts` | Modify | epic UI, feature Состояния интерфейса |
| `e2e/view-mode.spec.ts` | Modify | epic UI, feature Режим просмотра |

---

## Task 1: Codecov — CI интеграция

**Files:**
- Modify: `.github/workflows/ci.yml` — добавить шаг после Test
- Create: `codecov.yml` — конфиг

### Предварительное условие

Репозиторий `bon2362/book-club` должен быть подключён к Codecov (https://app.codecov.io).
Для публичных репозиториев токен не обязателен, но рекомендуется.
Если репозиторий **приватный** — добавь `CODECOV_TOKEN` в GitHub Secrets (Settings → Secrets → Actions).

- [ ] **Step 1: Создать `codecov.yml` в корне проекта**

```yaml
# codecov.yml
coverage:
  status:
    project:
      default:
        target: 80%
        threshold: 2%
    patch:
      default:
        target: 70%

comment:
  layout: "reach,diff,flags,files"
  behavior: default
  require_changes: false

ignore:
  - "lib/db/migrations/**"
  - "lib/db/schema.ts"
  - "lib/db/index.ts"
  - "app/api/test/**"
  - "app/api/auth/[...nextauth]/**"
```

- [ ] **Step 2: Добавить шаг загрузки coverage в CI**

Открой `.github/workflows/ci.yml`. Найди шаг `Test` — он выглядит так:

```yaml
      - name: Test
        run: npm test -- --passWithNoTests --coverage
        env:
          DATABASE_URL: postgresql://dummy:dummy@dummy/dummy
          SKIP_ENV_VALIDATION: 'true'
```

Сразу **после** этого шага добавь:

```yaml
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: false
          verbose: true
        env:
          CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}
```

Примечание: `fail_ci_if_error: false` — CI не падает если Codecov недоступен. Можно сменить на `true` когда интеграция стабилизируется.

- [ ] **Step 3: Добавить Codecov badge в README.md**

Открой `README.md`. Найди строку `**Live:** https://www.slowreading.club` и добавь строку перед ней:

```markdown
[![codecov](https://codecov.io/gh/bon2362/book-club/branch/main/graph/badge.svg)](https://codecov.io/gh/bon2362/book-club)
```

- [ ] **Step 4: Проверить lint и typecheck**

```bash
npm run lint && npm run typecheck
```

Ожидаемый результат: 0 ошибок (эти файлы не typescript, но на всякий случай).

- [ ] **Step 5: Коммит**

```bash
git add .github/workflows/ci.yml codecov.yml README.md
git commit -m "feat: добавить Codecov для загрузки Jest-покрытия в CI"
```

---

## Task 2: Allure теги — Admin specs (3 файла)

**Files:**
- Modify: `e2e/admin.spec.ts`
- Modify: `e2e/admin-book-status.spec.ts`
- Modify: `e2e/admin-delete-user.spec.ts`

Паттерн для всех e2e-файлов одинаковый:

```typescript
import { epic, feature } from 'allure-js-commons'

// Внутри test.describe или на верхнем уровне:
test.beforeEach(async () => {
  await epic('Название эпика')
  await feature('Название фичи')
})
```

Если в файле нет `test.describe` — добавить `test.beforeEach` на верхнем уровне (перед первым `test()`).

- [ ] **Step 1: Добавить теги в `e2e/admin.spec.ts`**

Добавить импорт в начало файла (после существующих импортов):

```typescript
import { epic, feature } from 'allure-js-commons'
```

Добавить `beforeEach` внутри `test.describe('панель администратора — доступ', () => {`:

```typescript
  test.beforeEach(async () => {
    await epic('Администрирование')
    await feature('Панель управления')
  })
```

- [ ] **Step 2: Добавить теги в `e2e/admin-book-status.spec.ts`**

Добавить импорт:

```typescript
import { epic, feature } from 'allure-js-commons'
```

Добавить `beforeEach` внутри `test.describe('AdminPanel — изменение статуса книги', () => {`:

```typescript
  test.beforeEach(async () => {
    await epic('Администрирование')
    await feature('Статус книги')
  })
```

Внимание: в этом файле уже есть `test.beforeEach` — добавить новый вызов **в начало существующего** `beforeEach`, не создавать второй:

```typescript
  test.beforeEach(async ({ page }) => {
    await epic('Администрирование')
    await feature('Статус книги')
    // ... остальной код beforeEach
```

- [ ] **Step 3: Добавить теги в `e2e/admin-delete-user.spec.ts`**

Аналогично — импорт и вызовы в начало существующего `beforeEach`:

```typescript
import { epic, feature } from 'allure-js-commons'
```

```typescript
  test.beforeEach(async ({ page }) => {
    await epic('Администрирование')
    await feature('Удаление пользователей')
    // ... остальной код
```

- [ ] **Step 4: Lint + typecheck**

```bash
npm run lint && npm run typecheck
```

- [ ] **Step 5: Коммит**

```bash
git add e2e/admin.spec.ts e2e/admin-book-status.spec.ts e2e/admin-delete-user.spec.ts
git commit -m "feat: добавить Allure-теги в admin e2e-тесты"
```

---

## Task 3: Allure теги — Auth specs (3 файла)

**Files:**
- Modify: `e2e/auth.spec.ts`
- Modify: `e2e/signup.spec.ts`
- Modify: `e2e/telegram-auth.spec.ts`

- [ ] **Step 1: Добавить теги в `e2e/auth.spec.ts`**

В этом файле нет `test.describe` — добавить `test.beforeEach` на верхнем уровне.

Добавить импорт:

```typescript
import { epic, feature } from 'allure-js-commons'
```

Добавить перед первым `test(`:

```typescript
test.beforeEach(async () => {
  await epic('Авторизация')
  await feature('Вход и выход')
})
```

- [ ] **Step 2: Добавить теги в `e2e/signup.spec.ts`**

Аналогично — нет describe, добавить beforeEach на верхнем уровне:

```typescript
import { epic, feature } from 'allure-js-commons'

test.beforeEach(async () => {
  await epic('Авторизация')
  await feature('Регистрация')
})
```

- [ ] **Step 3: Добавить теги в `e2e/telegram-auth.spec.ts`**

Внутри `test.describe('Авторизация через Telegram', () => {` добавить `beforeEach` (проверить нет ли существующего):

```typescript
import { epic, feature } from 'allure-js-commons'
```

```typescript
  test.beforeEach(async () => {
    await epic('Авторизация')
    await feature('Telegram')
  })
```

- [ ] **Step 4: Lint + typecheck**

```bash
npm run lint && npm run typecheck
```

- [ ] **Step 5: Коммит**

```bash
git add e2e/auth.spec.ts e2e/signup.spec.ts e2e/telegram-auth.spec.ts
git commit -m "feat: добавить Allure-теги в auth e2e-тесты"
```

---

## Task 4: Allure теги — Catalog specs (4 файла)

**Files:**
- Modify: `e2e/book-card.spec.ts`
- Modify: `e2e/search.spec.ts`
- Modify: `e2e/submit-book.spec.ts`
- Modify: `e2e/priority-hint.spec.ts`

- [ ] **Step 1: `e2e/book-card.spec.ts`**

Добавить импорт + `beforeEach` внутри `test.describe`:

```typescript
import { epic, feature } from 'allure-js-commons'
```

```typescript
  test.beforeEach(async () => {
    await epic('Каталог книг')
    await feature('Карточка книги')
  })
```

- [ ] **Step 2: `e2e/search.spec.ts`**

```typescript
import { epic, feature } from 'allure-js-commons'
```

```typescript
  test.beforeEach(async () => {
    await epic('Каталог книг')
    await feature('Поиск')
  })
```

- [ ] **Step 3: `e2e/submit-book.spec.ts`**

Нет describe — добавить на верхнем уровне:

```typescript
import { epic, feature } from 'allure-js-commons'

test.beforeEach(async () => {
  await epic('Каталог книг')
  await feature('Предложить книгу')
})
```

- [ ] **Step 4: `e2e/priority-hint.spec.ts`**

Нет describe — добавить на верхнем уровне:

```typescript
import { epic, feature } from 'allure-js-commons'

test.beforeEach(async () => {
  await epic('Каталог книг')
  await feature('Приоритеты книг')
})
```

- [ ] **Step 5: Lint + typecheck**

```bash
npm run lint && npm run typecheck
```

- [ ] **Step 6: Коммит**

```bash
git add e2e/book-card.spec.ts e2e/search.spec.ts e2e/submit-book.spec.ts e2e/priority-hint.spec.ts
git commit -m "feat: добавить Allure-теги в catalog e2e-тесты"
```

---

## Task 5: Allure теги — Profile + UI specs (4 файла)

**Files:**
- Modify: `e2e/profile.spec.ts`
- Modify: `e2e/theme.spec.ts`
- Modify: `e2e/ui-states.spec.ts`
- Modify: `e2e/view-mode.spec.ts`

- [ ] **Step 1: `e2e/profile.spec.ts`**

```typescript
import { epic, feature } from 'allure-js-commons'
```

```typescript
  test.beforeEach(async () => {
    await epic('Профиль')
    await feature('Редактирование профиля')
  })
```

- [ ] **Step 2: `e2e/theme.spec.ts`**

```typescript
import { epic, feature } from 'allure-js-commons'
```

```typescript
  test.beforeEach(async () => {
    await epic('UI')
    await feature('Тема')
  })
```

- [ ] **Step 3: `e2e/ui-states.spec.ts`**

Файл может содержать несколько `test.describe` блоков. Сначала прочитай файл целиком. Добавить `beforeEach` **на верхнем уровне** (до первого `test.describe`) — это покроет все тесты в файле независимо от количества блоков:

```typescript
import { epic, feature } from 'allure-js-commons'
```

```typescript
// На верхнем уровне, до первого test.describe:
test.beforeEach(async () => {
  await epic('UI')
  await feature('Состояния интерфейса')
})
```

- [ ] **Step 4: `e2e/view-mode.spec.ts`**

```typescript
import { epic, feature } from 'allure-js-commons'
```

```typescript
  test.beforeEach(async () => {
    await epic('UI')
    await feature('Режим просмотра')
  })
```

- [ ] **Step 5: Lint + typecheck + unit tests**

```bash
npm run lint && npm run typecheck && npm test
```

Ожидаемый результат: все unit-тесты зелёные, lint и typecheck — 0 ошибок.

- [ ] **Step 6: Коммит**

```bash
git add e2e/profile.spec.ts e2e/theme.spec.ts e2e/ui-states.spec.ts e2e/view-mode.spec.ts
git commit -m "feat: добавить Allure-теги в profile + UI e2e-тесты"
```

---

## Task 6: Финальная проверка и перевод issue

- [ ] **Step 1: Проверить typecheck по всем e2e файлам**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Запустить unit-тесты с покрытием**

```bash
npm test -- --coverage 2>&1 | tail -20
```

Убедиться, что coverage по-прежнему >= 80% (текущий уровень ~86%).

- [ ] **Step 3: Git push**

```bash
git push
```

- [ ] **Step 4: Перевести issue #86 в статус in-progress и закрыть после пуша**

```bash
export GH_TOKEN=$(grep GH_TOKEN /workspace/.env.local | cut -d= -f2)
LABELS=$(gh api /repos/bon2362/book-club/issues/86 \
  --jq '[.labels[].name | select(startswith("status:") | not)] + ["status:in-progress"] | join(",")' 2>/dev/null)
gh api /repos/bon2362/book-club/issues/86 --method PATCH --field labels="$LABELS"
```

После пуша закрыть:

```bash
export GH_TOKEN=$(grep GH_TOKEN /workspace/.env.local | cut -d= -f2)
COMMIT=$(git rev-parse --short HEAD)
gh api /repos/bon2362/book-club/issues/86 --method PATCH -f state=closed
gh api /repos/bon2362/book-club/issues/86/comments --method POST \
  -f body="Реализовано в коммите $COMMIT: добавлены Codecov upload в CI и Allure-теги (epic/feature) во все 14 e2e-спеков"
```

---

## Важные примечания

### allure-js-commons и beforeEach c параметрами page

Если существующий `beforeEach` принимает `{ page }`, добавляй вызовы в **начало** его тела:

```typescript
// Правильно — один beforeEach с параметрами И тегами
test.beforeEach(async ({ page }) => {
  await epic('Администрирование')
  await feature('Статус книги')
  // ... остальной код setup
})
```

Не создавай второй `test.beforeEach` — Playwright выполняет все `beforeEach` последовательно, но это усложняет читаемость.

### Файлы без test.describe

В файлах без `test.describe` (auth, signup, submit-book, priority-hint) — `test.beforeEach` на верхнем уровне применяется ко всем тестам в файле.

### Codecov token для публичного репозитория

Если `bon2362/book-club` — **публичный** репозиторий, `CODECOV_TOKEN` не обязателен (Codecov принимает публичные репо без токена). Шаг `codecov-action` просто проигнорирует отсутствующий секрет. Для приватного репо — добавить токен в GitHub Secrets.

**E2E: не нужен** — изменения касаются только CI конфига и Allure-тегов (метаданные), не UI-флоу и не бизнес-логики.
