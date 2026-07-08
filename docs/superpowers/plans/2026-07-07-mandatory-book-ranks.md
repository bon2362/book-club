# Обязательный ранг у каждой записи — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Каждая запись на книгу (`signup_books` с `personal_status = null`) всегда имеет ранг в `book_priorities`, чтобы книга гарантированно участвовала в матчинге.

**Architecture:** Вариант C — вся логика ранжирования в одном pure-модуле `lib/matching/rank-assignment.ts`, вызываемом из двух существующих choke-points: `upsertResolvedSignup` (`lib/signup-books.ts`, путь каталог-формы) и `MatchingTransitionExecutor` (`lib/matching/session-transition-db.ts`, путь доски/профиля). Плюс разовая SQL-миграция для колонки `rank_source` и бэкфилла.

**Tech Stack:** Next.js 14, Drizzle ORM, Neon Postgres, Jest (unit + static-SQL), Playwright (E2E). Миграции — hand-written SQL, применяются `node scripts/apply-migration.mjs <файл>`.

**Спека:** `docs/superpowers/specs/2026-07-07-mandatory-book-ranks-design.md`

## Global Constraints

- **Только PR-flow.** Выполнять в отдельном worktree от свежего `origin/main` (см. CLAUDE.md «Стандартный цикл»). Worktree создаётся ДО первой правки. Никаких прямых коммитов в `main`.
- **Перед каждым коммитом:** `npm run lint && npm run typecheck && npm test` зелёные. `--no-verify` запрещён.
- **Все мутации `book_priorities`/`signup_books` — только через `withAuditContext`** (ESLint это проверяет). Не должно появляться `source='trigger'` для `book_priorities`.
- **Дизайн-токены:** любой новый UI — только `var(--…)`, острые углы, без теней (CLAUDE.md «Дизайн-система»).
- **Значения `rank_source`:** строго `'auto' | 'manual'`. `'manual'` ставится ТОЛЬКО при явном reorder/drag; авто-append и бэкфилл — всегда `'auto'`.
- **Инвариант:** `signup_books.personal_status IS NULL` ⟺ существует ровно одна строка `book_priorities` для (user, book). Статусы `reading`/`read` → строки `book_priorities` нет.

---

## Task 1: Pure-модуль ранжирования `lib/matching/rank-assignment.ts`

Ядро всех решений о рангах — чистые функции без БД, полностью покрытые unit-тестами. Остальные задачи только вызывают их.

**Files:**
- Create: `lib/matching/rank-assignment.ts`
- Test: `lib/matching/__tests__/rank-assignment.test.ts`

**Interfaces:**
- Produces:
  - `type RankSource = 'auto' | 'manual'`
  - `interface RankedBook { bookId: string; rank: number }`
  - `interface RankAssignment { bookId: string; rank: number; source: RankSource }`
  - `function nextRank(existing: RankedBook[]): number`
  - `function compactRanks(existing: RankedBook[]): RankedBook[]`
  - `function manualOrder(bookIds: string[]): RankAssignment[]`
  - `function planBackfill(ranked: RankedBook[], unrankedInOrder: string[]): RankAssignment[]`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/matching/__tests__/rank-assignment.test.ts
import { nextRank, compactRanks, manualOrder, planBackfill } from '../rank-assignment'

describe('nextRank', () => {
  it('returns 1 for an empty list', () => {
    expect(nextRank([])).toBe(1)
  })
  it('returns max rank + 1', () => {
    expect(nextRank([{ bookId: 'a', rank: 1 }, { bookId: 'b', rank: 4 }])).toBe(5)
  })
})

describe('compactRanks', () => {
  it('reindexes to 1..N preserving ascending rank order', () => {
    expect(compactRanks([{ bookId: 'b', rank: 5 }, { bookId: 'a', rank: 2 }])).toEqual([
      { bookId: 'a', rank: 1 },
      { bookId: 'b', rank: 2 },
    ])
  })
})

describe('manualOrder', () => {
  it('assigns rank = position and source manual', () => {
    expect(manualOrder(['x', 'y'])).toEqual([
      { bookId: 'x', rank: 1, source: 'manual' },
      { bookId: 'y', rank: 2, source: 'manual' },
    ])
  })
})

describe('planBackfill', () => {
  it('keeps existing ranks as manual and appends unranked as auto', () => {
    const result = planBackfill(
      [{ bookId: 'b', rank: 2 }, { bookId: 'a', rank: 1 }],
      ['c', 'd'],
    )
    expect(result).toEqual([
      { bookId: 'a', rank: 1, source: 'manual' },
      { bookId: 'b', rank: 2, source: 'manual' },
      { bookId: 'c', rank: 3, source: 'auto' },
      { bookId: 'd', rank: 4, source: 'auto' },
    ])
  })
  it('handles a user with no prior ranks', () => {
    expect(planBackfill([], ['c', 'd'])).toEqual([
      { bookId: 'c', rank: 1, source: 'auto' },
      { bookId: 'd', rank: 2, source: 'auto' },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rank-assignment`
Expected: FAIL — `Cannot find module '../rank-assignment'`

- [ ] **Step 3: Write the implementation**

```typescript
// lib/matching/rank-assignment.ts
export type RankSource = 'auto' | 'manual'

export interface RankedBook {
  bookId: string
  rank: number
}

export interface RankAssignment {
  bookId: string
  rank: number
  source: RankSource
}

/** Следующий ранг при добавлении книги в конец списка. */
export function nextRank(existing: RankedBook[]): number {
  return existing.reduce((max, row) => Math.max(max, row.rank), 0) + 1
}

/** Переиндексация 1..N по возрастанию текущего ранга (после удаления). */
export function compactRanks(existing: RankedBook[]): RankedBook[] {
  return [...existing]
    .sort((a, b) => a.rank - b.rank)
    .map((row, index) => ({ bookId: row.bookId, rank: index + 1 }))
}

/** Явное упорядочивание: ранг = позиция, источник manual. */
export function manualOrder(bookIds: string[]): RankAssignment[] {
  return bookIds.map((bookId, index) => ({ bookId, rank: index + 1, source: 'manual' }))
}

/** Бэкфилл одного пользователя: существующие ранги → manual, нератированные → auto в конец. */
export function planBackfill(ranked: RankedBook[], unrankedInOrder: string[]): RankAssignment[] {
  const kept = compactRanks(ranked).map((row): RankAssignment => ({ ...row, source: 'manual' }))
  const appended = unrankedInOrder.map((bookId, index): RankAssignment => ({
    bookId,
    rank: kept.length + index + 1,
    source: 'auto',
  }))
  return [...kept, ...appended]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- rank-assignment`
Expected: PASS (все 6 тестов)

- [ ] **Step 5: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: без ошибок

- [ ] **Step 6: Commit**

```bash
git add lib/matching/rank-assignment.ts lib/matching/__tests__/rank-assignment.test.ts
git commit -m "feat: pure rank-assignment helpers for mandatory book ranks"
```

**Тесты:** E2E не нужен (чистая функция, БД не трогается). Wiki не нужна (внутренний хелпер, поведение наружу не меняется).

---

## Task 2: Схема + колонка `rank_source`

Добавить колонку в Drizzle-схему и SQL-миграцию (без бэкфилла — он в Task 3). Статический тест по образцу `drizzle/0040_audit_triggers.test.ts`.

**Files:**
- Modify: `lib/db/schema.ts:178-185` (таблица `bookPriorities`)
- Create: `drizzle/0051_book_priorities_rank_source.sql`
- Test: `drizzle/0051_book_priorities_rank_source.test.ts`

**Interfaces:**
- Produces: `bookPriorities.rankSource` — Drizzle-колонка `text('rank_source')`, `$type<'auto' | 'manual'>()`, `.notNull().default('auto')`.

- [ ] **Step 1: Write the failing test**

```typescript
// drizzle/0051_book_priorities_rank_source.test.ts
/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0051 book_priorities rank_source migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0051_book_priorities_rank_source.sql'), 'utf8')

  it('adds the rank_source column with an auto default', () => {
    expect(sql).toMatch(/ALTER TABLE "book_priorities" ADD COLUMN IF NOT EXISTS "rank_source" text NOT NULL DEFAULT 'auto'/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- 0051_book_priorities_rank_source`
Expected: FAIL — файл `.sql` не существует (`ENOENT`)

- [ ] **Step 3: Create the migration SQL**

```sql
-- drizzle/0051_book_priorities_rank_source.sql
ALTER TABLE "book_priorities" ADD COLUMN IF NOT EXISTS "rank_source" text NOT NULL DEFAULT 'auto';
```

- [ ] **Step 4: Add the column to the Drizzle schema**

В `lib/db/schema.ts` в таблице `bookPriorities` (после `rank`):

```typescript
export const bookPriorities = pgTable('book_priorities', {
  userId:     text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bookId:     text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  rank:       integer('rank').notNull(),
  rankSource: text('rank_source').$type<'auto' | 'manual'>().notNull().default('auto'),
  updatedAt:  timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.bookId] }),
}))
```

- [ ] **Step 5: Run test + typecheck**

Run: `npm test -- 0051_book_priorities_rank_source && npm run typecheck`
Expected: тест PASS, typecheck без ошибок

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts drizzle/0051_book_priorities_rank_source.sql drizzle/0051_book_priorities_rank_source.test.ts
git commit -m "feat: add rank_source column to book_priorities"
```

**Тесты:** E2E не нужен (только схема). Wiki нужна — меняется БД-схема; отражается в Task 8. `AUDITED_TABLES` уже содержит `book_priorities`; `rank_source` не чувствительная колонка → маскирование в `audit_capture()` не требуется (тест `drizzle/0040_audit_triggers.test.ts` остаётся зелёным).

---

## Task 3: Бэкфилл-миграция (существующие данные)

Проставить `rank_source='manual'` существующим рангам и дописать нератированные записи (`personal_status IS NULL`) в конец по `signed_at` с `rank_source='auto'`. В журнале аудита — системная операция.

**Files:**
- Create: `drizzle/0052_backfill_book_ranks.sql`
- Test: `drizzle/0052_backfill_book_ranks.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// drizzle/0052_backfill_book_ranks.test.ts
/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0052 backfill book ranks migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0052_backfill_book_ranks.sql'), 'utf8')

  it('runs inside a transaction tagged as a system audit source', () => {
    expect(sql).toContain('BEGIN;')
    expect(sql).toContain("SET LOCAL app.audit_source = 'system'")
    expect(sql).toContain('COMMIT;')
  })
  it('marks all pre-existing ranks as manual', () => {
    expect(sql).toMatch(/UPDATE "book_priorities" SET "rank_source" = 'manual'/)
  })
  it('appends unranked null-status signups ordered by signed_at as auto', () => {
    expect(sql).toContain('INSERT INTO "book_priorities"')
    expect(sql).toContain('personal_status" IS NULL')
    expect(sql).toContain('ROW_NUMBER() OVER')
    expect(sql).toContain('ORDER BY s."signed_at"')
    expect(sql).toContain("'auto'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- 0052_backfill_book_ranks`
Expected: FAIL — `.sql` не существует

- [ ] **Step 3: Create the backfill SQL**

Одним chunk (без `--> statement-breakpoint`), чтобы `SET LOCAL` действовал на весь бэкфилл в рамках одной транзакции. `apply-migration.mjs` выполнит его как один `pool.query`.

```sql
-- drizzle/0052_backfill_book_ranks.sql
-- Разовый бэкфилл. Все существующие ранги проставлялись только явным reorder → manual.
-- Нератированные записи (personal_status IS NULL) дописываем в конец по signed_at → auto.
-- Транзакция помечает audit-триггер как системную операцию (source='system', actor=null).
BEGIN;
SET LOCAL app.audit_source = 'system';

UPDATE "book_priorities" SET "rank_source" = 'manual';

INSERT INTO "book_priorities" ("user_id", "book_id", "rank", "rank_source", "updated_at")
SELECT
  s."user_id",
  s."book_id",
  COALESCE(m.max_rank, 0) + ROW_NUMBER() OVER (
    PARTITION BY s."user_id" ORDER BY s."signed_at", s."book_id"
  ),
  'auto',
  now()
FROM "signup_books" s
LEFT JOIN (
  SELECT "user_id", MAX("rank") AS max_rank FROM "book_priorities" GROUP BY "user_id"
) m ON m."user_id" = s."user_id"
WHERE s."personal_status" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "book_priorities" bp
    WHERE bp."user_id" = s."user_id" AND bp."book_id" = s."book_id"
  );

COMMIT;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- 0052_backfill_book_ranks`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add drizzle/0052_backfill_book_ranks.sql drizzle/0052_backfill_book_ranks.test.ts
git commit -m "feat: backfill migration for mandatory book ranks"
```

**Применение (после merge PR, вручную оператором — НЕ в CI):**
```bash
node scripts/apply-migration.mjs drizzle/0051_book_priorities_rank_source.sql
node scripts/apply-migration.mjs drizzle/0052_backfill_book_ranks.sql
```
Указать в описании PR как обязательный ручной шаг после деплоя. Если многооператорный `BEGIN; … COMMIT;` в одном `pool.query` не проходит на Neon — fallback: обернуть тем же телом, но применить через `psql "$DATABASE_URL" -f drizzle/0052_backfill_book_ranks.sql`.

**Тесты:** E2E не нужен (разовая миграция, проверяется статически + ручной верификацией на e2e-ветке). Wiki нужна — операционный шаг миграции (Task 8).

---

## Task 4: Авто-ранг на пути каталог-формы (`upsertResolvedSignup`)

`upsertResolvedSignup.runInTx` — единственный choke-point каталог-формы (вызывается и при активной сессии через `replaceSignup`, и без неё через `/api/signup`). После delete/insert записей: удалить осиротевшие ранги, дописать auto-ранги новым книгам, компактизировать.

**Files:**
- Modify: `lib/signup-books.ts:130-157` (тело `runInTx`)
- Modify: `app/api/signup/route.ts:58-79` (убрать дублирующую чистку `bookPriorities`, теперь она в `runInTx`)
- Modify: `lib/matching/session-transition-db.ts:443-494` (`replaceSignup`: убрать собственную чистку priorities — её делает `upsertSignupByBookIds`)
- Test: `lib/matching/__tests__/rank-assignment.test.ts` (уже покрывает pure-логику; здесь — интеграция через E2E в Task 7)

**Interfaces:**
- Consumes: `nextRank`, `compactRanks` из `lib/matching/rank-assignment.ts` (Task 1).

- [ ] **Step 1: Обновить `runInTx` в `lib/signup-books.ts`**

Заменить тело `runInTx` (строки 130-157) на версию, поддерживающую инвариант. Импортировать вверху файла:

```typescript
import { bookPriorities } from '@/lib/db/schema'
import { nextRank, compactRanks } from '@/lib/matching/rank-assignment'
```

Новое тело `runInTx`:

```typescript
  const runInTx = async (tx: typeof db) => {
    const existing = await tx
      .select({ bookId: signupBooks.bookId })
      .from(signupBooks)
      .where(eq(signupBooks.userId, userId))

    const existingIds = new Set(existing.map(e => e.bookId))
    const toDelete = Array.from(existingIds).filter(id => !newBookIds.includes(id))
    const toAdd = newBookIds.filter(id => !existingIds.has(id))
    newlyAddedBookIds = toAdd
    removedBookIds = toDelete

    if (toDelete.length > 0) {
      await tx
        .delete(signupBooks)
        .where(and(eq(signupBooks.userId, userId), inArray(signupBooks.bookId, toDelete)))
      // Инвариант: удалённая запись не оставляет висящий ранг.
      await tx
        .delete(bookPriorities)
        .where(and(eq(bookPriorities.userId, userId), inArray(bookPriorities.bookId, toDelete)))
    }

    if (toAdd.length > 0) {
      await tx
        .insert(signupBooks)
        .values(toAdd.map(bookId => ({ userId, bookId })))
        .onConflictDoNothing()
    }

    // Дописать auto-ранги новым книгам в конец списка приоритетов.
    const ranked = await tx
      .select({ bookId: bookPriorities.bookId, rank: bookPriorities.rank })
      .from(bookPriorities)
      .where(eq(bookPriorities.userId, userId))
    let rankCursor = nextRank(ranked)
    const missingRank = toAdd.filter(id => !ranked.some(r => r.bookId === id))
    for (const bookId of missingRank) {
      await tx
        .insert(bookPriorities)
        .values({ userId, bookId, rank: rankCursor, rankSource: 'auto' })
        .onConflictDoNothing()
      rankCursor += 1
    }

    // Компактизация после удалений, чтобы ранги оставались 1..N.
    if (toDelete.length > 0) {
      const remaining = await tx
        .select({ bookId: bookPriorities.bookId, rank: bookPriorities.rank })
        .from(bookPriorities)
        .where(eq(bookPriorities.userId, userId))
      for (const row of compactRanks(remaining)) {
        await tx
          .update(bookPriorities)
          .set({ rank: row.rank, updatedAt: new Date() })
          .where(and(eq(bookPriorities.userId, userId), eq(bookPriorities.bookId, row.bookId)))
      }
    }
  }
```

- [ ] **Step 2: Убрать дублирующую чистку priorities в `app/api/signup/route.ts`**

В else-ветке (строки 58-79) удалить блок `tx.delete(bookPriorities)...` (`if (upsert.addedBookIds.length > 0) { ... } else { ... }`) — теперь чистку делает `runInTx`. Оставить `upsertSignupByBookIds` и `users.update` (name/contacts/prioritiesSet). Итоговая else-ветка:

```typescript
      result = await withAuditContext(auditCtx, async (tx) => {
        const upsert = await upsertSignupByBookIds(pgUserId, selectedBookIds as string[], tx)
        await tx.update(users).set({
          name: name.trim(),
          contacts: contacts.trim(),
          ...(upsert.addedBookIds.length === 0 ? { prioritiesSet: false } : {}),
        }).where(eq(users.id, pgUserId))
        return upsert
      })
```

Удалить теперь неиспользуемый импорт `notInArray` из `app/api/signup/route.ts:5`, если он больше нигде не используется (проверить Grep) — иначе `no-unused-vars`.

- [ ] **Step 3: Убрать дублирующую чистку priorities в `replaceSignup`**

В `lib/matching/session-transition-db.ts` `replaceSignup` (строки 472-491) удалить блок, который сам чистит `bookPriorities` (`if (result.addedBookIds.length > 0) { retainedPriorities... } else { delete all }`) — эту работу теперь делает `upsertSignupByBookIds`. Оставить логику обновления профиля (name/contacts/prioritiesSet) без изменений. Метод возвращает то же значение.

- [ ] **Step 4: Lint + typecheck + unit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: без ошибок; все тесты зелёные

- [ ] **Step 5: Commit**

```bash
git add lib/signup-books.ts app/api/signup/route.ts lib/matching/session-transition-db.ts
git commit -m "feat: catalog signup assigns auto ranks (invariant at signup choke-point)"
```

**Тесты:** E2E нужен — меняется персистентный флоу записи (Task 7, с `page.reload()`). Wiki нужна — меняется user-flow записи (Task 8).

---

## Task 5: Авто-ранг и manual-источник в executor'е доски матчинга

Закрыть оставшиеся пути: добавление книги на доске, возврат из `reading/read`, явный reorder (пометка manual).

**Files:**
- Modify: `lib/matching/session-transition-db.ts:391-441` (`changeBook`, `reorderPriorities`)
- Modify: `lib/matching/session-transition-db.ts:496-534` (`changeStatus`)
- Modify: `app/api/priorities/route.ts:82-94` (no-session ветка: `rankSource='manual'`)

**Interfaces:**
- Consumes: `nextRank` из `lib/matching/rank-assignment.ts`.

- [ ] **Step 1: `changeBook('add')` — дописывать auto-ранг**

В `lib/matching/session-transition-db.ts` импортировать `import { nextRank } from './rank-assignment'`. Ветку `add` (строки 396-402) заменить:

```typescript
    if (operation === 'add') {
      const inserted = await this.tx
        .insert(signupBooks)
        .values({ userId, bookId })
        .onConflictDoNothing()
        .returning({ bookId: signupBooks.bookId })
      if (inserted.length > 0) {
        const ranked = await this.tx
          .select({ rank: bookPriorities.rank })
          .from(bookPriorities)
          .where(eq(bookPriorities.userId, userId))
        await this.tx
          .insert(bookPriorities)
          .values({ userId, bookId, rank: nextRank(ranked.map(r => ({ bookId, rank: r.rank }))), rankSource: 'auto' })
          .onConflictDoNothing()
      }
      return inserted.length > 0
    }
```

- [ ] **Step 2: `changeStatus` — при возврате в `null` дописывать auto-ранг**

В блоке `changeStatus` после существующей логики `if (status !== null) { … компактизация … }` добавить ветку для возврата в `null` (книга снова участвует):

```typescript
    if (status !== null) {
      // ... существующая логика: delete rank + компактизация ...
    } else {
      // Возврат книги в матчинг: дописать auto-ранг в конец, если его нет.
      const ranked = await this.tx
        .select({ rank: bookPriorities.rank })
        .from(bookPriorities)
        .where(eq(bookPriorities.userId, userId))
      await this.tx
        .insert(bookPriorities)
        .values({ userId, bookId, rank: nextRank(ranked.map(r => ({ bookId, rank: r.rank }))), rankSource: 'auto' })
        .onConflictDoNothing()
    }
```

- [ ] **Step 3: `reorderPriorities` — пометить manual**

В `reorderPriorities` (строки 429-441) добавить `rankSource: 'manual'` в insert и в `set` при конфликте:

```typescript
  private async reorderPriorities(userId: string, bookIds: string[]): Promise<boolean> {
    for (let index = 0; index < bookIds.length; index++) {
      await this.tx
        .insert(bookPriorities)
        .values({ userId, bookId: bookIds[index], rank: index + 1, rankSource: 'manual' })
        .onConflictDoUpdate({
          target: [bookPriorities.userId, bookPriorities.bookId],
          set: { rank: index + 1, rankSource: 'manual', updatedAt: new Date() },
        })
    }
    await this.tx.update(users).set({ prioritiesSet: true }).where(eq(users.id, userId))
    return true
  }
```

- [ ] **Step 4: `/api/priorities` no-session ветка — manual**

В `app/api/priorities/route.ts` (строки 86-91) добавить `rankSource: 'manual'`:

```typescript
        await tx.insert(bookPriorities).values(validBookIds.map((bookId, index) => ({
          userId,
          bookId,
          rank: index + 1,
          rankSource: 'manual' as const,
          updatedAt: now,
        })))
```

- [ ] **Step 5: Lint + typecheck + unit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: без ошибок; все тесты зелёные

- [ ] **Step 6: Commit**

```bash
git add lib/matching/session-transition-db.ts app/api/priorities/route.ts
git commit -m "feat: matching board add/status-return assign auto rank, explicit reorder marks manual"
```

**Тесты:** E2E нужен — меняется персистентное поведение доски и статусов (Task 7). Wiki нужна — user-flow матчинга (Task 8).

---

## Task 6: UI — сообщение в профиле и индикатор источника в админке

**Files:**
- Modify: `components/nd/ProfileDrawer.tsx:1176-1184` (баннер) и логика `unrankedBooks`
- Modify: `components/nd/AdminUserDrawer.tsx:399-414` (индикатор `rank_source`)
- Modify: `lib/admin-users.ts` (пробросить `rankSource` в данные пользователя, если ещё нет)

- [ ] **Step 1: Переформулировать баннер профиля**

В `components/nd/ProfileDrawer.tsx` заменить текст баннера (строки 1181-1183) с принуждающего на мягкий:

```tsx
                  <strong>Порядок = твой приоритет:</strong> книги идут в порядке добавления. Перетащи их так, чтобы сверху были те, что хочется прочитать сильнее — если хочешь уточнить.
```

Условие показа (`prioritiesLoaded && !prioritiesSet && priorityOrder.length > 0`) оставить: баннер показывается тем, кто ещё ни разу не перетаскивал (все ранги auto). Он больше не про «участие», а про уточнение.

- [ ] **Step 2: Прокинуть `rankSource` в админ-данные**

В `lib/admin-users.ts` в выборке приоритетов пользователя (`priorityRows`) добавить `rankSource: bookPriorities.rankSource` в `.select({...})`, и включить его в возвращаемую структуру книги пользователя (там, где формируется список с рангами). Проверить тип возвращаемого значения (`AdminUserSummary`/drawer-модель) — добавить поле `rankSource?: 'auto' | 'manual'` на книгу.

- [ ] **Step 3: Показать источник в `AdminUserDrawer`**

В `components/nd/AdminUserDrawer.tsx` рядом с рангом книги (строки ~413-414) показать метку источника. Использовать существующий стиль микрометки (UPPERCASE, `var(--text-muted)`, токены — CLAUDE.md дизайн-система):

```tsx
                        {rank !== undefined && (
                          <span style={{
                            fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase',
                            color: 'var(--text-muted)', marginLeft: 6,
                          }}>
                            {book.rankSource === 'manual' ? 'вручную' : 'авто'}
                          </span>
                        )}
```

- [ ] **Step 4: Lint + typecheck + unit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: без ошибок

- [ ] **Step 5: Commit**

```bash
git add components/nd/ProfileDrawer.tsx components/nd/AdminUserDrawer.tsx lib/admin-users.ts
git commit -m "feat: soften profile priority banner, show rank source in admin drawer"
```

**Тесты:** E2E — текст баннера покрывается частично в Task 7; строгий boundingBox не нужен (нет нового CSS-поведения скрытия/позиционирования, только текст и статичная метка). Wiki нужна — админский workflow (Task 8).

---

## Task 7: E2E — персистентность рангов

Проверить главные user-flow с обязательной перезагрузкой страницы (ловит «работает визуально, но не персистится»). **Перед написанием прочитать `docs/features/testing.md`** (гочи: live-locators, `session.user.id`, `createTestBook`-фикстура, изоляция e2e-ветки).

**Files:**
- Modify/Create: `e2e/matching.spec.ts` или новый `e2e/mandatory-ranks.spec.ts` (следовать существующей структуре и фикстурам `e2e/fixtures.ts`)

- [ ] **Step 1: Тест «добавил книгу в каталоге → после reload книга с рангом»**

Сценарий (использовать `loginAsUser`/фикстуры из `e2e/fixtures.ts`, `createTestBook`):
1. Залогиниться тестовым пользователем.
2. Записаться на книгу через каталог-форму (или `/api/signup`).
3. Открыть профиль → вкладка «Мои книги» → книга в секции «Записал:ась» с числовым рангом (не «?»).
4. `await page.reload()`.
5. Ранг книги сохранён (тот же номер).

- [ ] **Step 2: Тест «вернул из Читаю → ранг восстановился»**

1. У пользователя есть книга с рангом.
2. Пометить «Читаю» → книга уходит из секции приоритетов.
3. Вернуть статус в null.
4. `await page.reload()`.
5. Книга снова в секции «Записал:ась» с рангом в конце списка.

- [ ] **Step 3: Прогнать E2E**

Run: `npm run test:e2e e2e/mandatory-ranks.spec.ts`
Expected: PASS (оба теста)

- [ ] **Step 4: Commit**

```bash
git add e2e/mandatory-ranks.spec.ts
git commit -m "test(e2e): book ranks persist across reload on signup and status-return"
```

**Тесты:** это и есть E2E-задача. Wiki не нужна (тесты).

---

## Task 8: Документация (features + wiki)

**Files:**
- Modify: `docs/features/matching.md` (или соответствующий) и `docs/features/user-profile.md` — code-level: инвариант «signup(null) ⟺ rank», `rank_source`, choke-points.
- Modify: `docs/wiki/` — соответствующие страницы (матчинг, профиль, БД-схема): что запись всегда участвует, что такое «авто/вручную», операционный шаг применения миграций 0051/0052.

- [ ] **Step 1: Обновить `docs/features/*`**

Описать инвариант, где он обеспечивается (`upsertResolvedSignup`, executor), колонку `rank_source`, что бэкфилл — разовый.

- [ ] **Step 2: Обновить `docs/wiki/*`**

Для владельца проекта: «любая добавленная книга участвует в матчинге», смысл «авто/вручную», обязательный ручной шаг миграции после деплоя (0051 затем 0052).

- [ ] **Step 3: Commit**

```bash
git add docs/features docs/wiki
git commit -m "docs: mandatory book ranks — invariant, rank_source, migration step"
```

- [ ] **Step 4: Открыть PR и довести до merge**

```bash
git push -u origin <ветка>
gh pr create --fill
gh pr merge --auto --squash --delete-branch
gh pr view <num> --json mergeStateStatus,mergeable   # правило 9 CLAUDE.md
```
Фоновый watch CI (`run_in_background`). На BEHIND — `gh pr update-branch`. В описании PR явно указать ручной шаг применения миграций 0051/0052 после деплоя.

**Тесты:** E2E не нужен (доки). Wiki — это и есть Wiki-задача.

---

## Self-Review (заполнено при написании плана)

- **Покрытие спеки:** решения 1-4 → Task 1/4/5 (авто-ранг, append, manual), 3 (бэкфилл), 2 (`rank_source`). Инвариант → Task 4/5. `changeStatus`-баг → Task 5 Step 2. UI/сообщение → Task 6. Аудит `source='system'` → Task 3. Тесты → Task 1/2/3/7. Доки → Task 8. `priorities_set` не удаляем (вне scope) — Task 5/6 сохраняют текущую установку флага.
- **Placeholder-скан:** конкретные пути, SQL и TS во всех шагах; заглушек нет.
- **Согласованность типов:** `RankAssignment`/`RankedBook`/`RankSource` из Task 1 используются в Task 4/5; колонка `rankSource: 'auto'|'manual'` из Task 2 согласована во всех insert/select.
- **Известное ограничение:** SQL-мутации executor'а/`runInTx` не покрываются unit-тестами (в репо нет DB-unit-харнесса — тесты статические/pure), поэтому их поведение верифицируется E2E (Task 7) + ручной проверкой на e2e-ветке Neon. Pure-логика рангов вынесена в Task 1 и покрыта полностью.
