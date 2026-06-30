# Matching Locked Circles Admin Route Implementation Plan

**Goal:** Починить пустой реестр закреплённых кругов в админской вкладке матчинга.

**Architecture:** Новый admin-only GET route читает исторические записи `matching_locked_circles`, присоединяет книги, отдельным запросом получает member snapshots и собирает существующий DTO для `AdminMatchingSession`. Публичный read-model и транзакционный matching service не меняются.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM, Jest, Playwright, OpenAPI.

---

### Task 1: Зафиксировать отсутствующий route тестом

**Files:**
- Create: `app/api/admin/matching/sessions/[id]/locked-circles/route.test.ts`

1. Добавить тест 403 для не-администратора.
2. Добавить тест пустого результата без запроса members.
3. Добавить тест DTO для locked/dissolved кругов с title, причиной и snapshots.
4. Запустить только новый тест и убедиться, что он падает из-за отсутствующего route.

### Task 2: Реализовать минимальный read route

**Files:**
- Create: `app/api/admin/matching/sessions/[id]/locked-circles/route.ts`

1. Проверить `auth()` и `isAdmin`.
2. Выбрать явные поля кругов и `books.title`, сортируя по `lockedAt DESC`.
3. Для непустого списка получить всех members, сгруппировать по `circleId` и вернуть `{ success: true, data }`.
4. Запустить route test до зелёного результата.

### Task 3: Закрыть пользовательскую регрессию E2E

**Files:**
- Modify: `e2e/matching-satisfaction.spec.ts`

1. В существующем сценарии закрепления сделать первого участника администратором.
2. После observer-проверок открыть `/admin?tab=matching`.
3. Проверить, что `locked-circle-row` содержит название книги и оба snapshot-имени.
4. Запустить matching satisfaction spec.

### Task 4: Синхронизировать контракт и документацию

**Files:**
- Modify: `public/openapi.json`
- Modify: `docs/features/matching.md`
- Modify: `docs/wiki/API-and-Swagger.md`
- Modify: `docs/wiki/Group-Matching-Mode.md`

1. Описать GET endpoint и response schema в OpenAPI.
2. Указать route как источник админского реестра в технической документации.
3. Добавить endpoint в обе Wiki-таблицы API.

### Task 5: Проверить и доставить

1. Запустить lint, typecheck, unit, matching E2E и build.
2. Провести adversarial review diff и исправить найденное.
3. Commit, push, PR, auto-merge; проверить merge state и дождаться зелёного CI.
4. После production deploy повторить smoke: реестр → dissolve с причиной → active participants → analytics/audit → freeze тестовой сессии.
