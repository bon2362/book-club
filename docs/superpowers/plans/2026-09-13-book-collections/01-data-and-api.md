# Подборки — PR 1: данные, логика и API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Таблицы подборок и настроек, чистая логика статусов и разницы, слой БД и все API-роуты — без интерфейса.

**Architecture:** Чистые функции в `lib/collections/{types,errors,rules,diff,format}.ts` покрываются тестами без БД; `lib/collections/repo.ts` только читает/пишет и вызывает планировщики патчей из `rules.ts`; роуты тонкие и тестируются на моках `repo`.

**Tech Stack:** Drizzle ORM, Neon Postgres, Next.js route handlers, Jest (`@jest-environment node`).

**Spec:** `docs/superpowers/specs/2026-09-12-book-collections-design.md`; общий обзор и контракты — `00-overview.md` (прочитать «Global Constraints» и «Уточнения к спеке»).

## Global Constraints

См. `00-overview.md` → «Global Constraints». Особенно: мутации только через `withAuditContext`; `force-dynamic`; лимиты 120 / 60 / 5000 / 50 / ≥2; перестановка не отправляет в очередь; автор не удаляет `published`.

## Подготовка

- [ ] **Worktree**

```bash
cd /Users/ekoshkin/book-club
git fetch origin main
git worktree add ../book-club-collections-1 -b feat/collections-data-api origin/main
cd ../book-club-collections-1
ln -s ../book-club/node_modules node_modules
git status --short --branch   # ## feat/collections-data-api...origin/main
```

---

### Task 1: Общий модуль адресов `lib/slug.ts`

**Files:**
- Create: `lib/slug.ts`, `lib/slug.test.ts`
- Modify: `lib/calendar/slug.ts`

**Interfaces:**
- Produces: `slugifyTitle(title: string, fallback?: string): string`, `uniqueSlug(base: string, taken: ReadonlySet<string>, reserved?: ReadonlySet<string>): string`

- [ ] **Step 1: Тест**

```ts
// lib/slug.test.ts
import { slugifyTitle, uniqueSlug } from '@/lib/slug'

describe('slugifyTitle', () => {
  it('транслитерирует и схлопывает разделители', () => {
    expect(slugifyTitle('Как государство научилось видеть')).toBe('kak-gosudarstvo-nauchilos-videt')
  })
  it('возвращает запасной адрес для пустого результата', () => {
    expect(slugifyTitle('!!!', 'podborka')).toBe('podborka')
    expect(slugifyTitle('')).toBe('krug')
  })
})

describe('uniqueSlug', () => {
  it('оставляет свободный адрес', () => {
    expect(uniqueSlug('istoriya', new Set())).toBe('istoriya')
  })
  it('добавляет суффикс -2, -3 при занятости', () => {
    expect(uniqueSlug('istoriya', new Set(['istoriya', 'istoriya-2']))).toBe('istoriya-3')
  })
  it('обходит зарезервированные адреса', () => {
    expect(uniqueSlug('new', new Set(), new Set(['new']))).toBe('new-2')
  })
})
```

- [ ] **Step 2: Прогон — падает** (`npx jest lib/slug.test.ts` → `Cannot find module '@/lib/slug'`)

- [ ] **Step 3: Реализация**

```ts
// lib/slug.ts
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y',
  ь: '', э: 'e', ю: 'yu', я: 'ya',
}

export function slugifyTitle(title: string, fallback = 'krug'): string {
  const transliterated = title.toLowerCase().split('')
    .map((char) => (char in TRANSLIT ? TRANSLIT[char] : char))
    .join('')
  const slug = transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || fallback
}

export function uniqueSlug(
  base: string,
  taken: ReadonlySet<string>,
  reserved: ReadonlySet<string> = new Set(),
): string {
  let candidate = base
  let suffix = 1
  while (taken.has(candidate) || reserved.has(candidate)) {
    suffix += 1
    candidate = `${base}-${suffix}`
  }
  return candidate
}
```

`lib/calendar/slug.ts` — удалить `TRANSLIT`, `FALLBACK_SLUG` и тело `slugifyTitle`, оставить `buildSlug` без изменений и добавить сверху:

```ts
import { slugifyTitle } from '@/lib/slug'

export { slugifyTitle }
```

- [ ] **Step 4: Прогон** `npx jest lib/slug.test.ts lib/calendar` → PASS (тесты календаря не менялись)

- [ ] **Step 5: Коммит**

```bash
git add lib/slug.ts lib/slug.test.ts lib/calendar/slug.ts
git commit -m "refactor: вынести транслитерацию адресов в lib/slug"
```

---

### Task 2: Миграция, схема и аудит

**Files:**
- Create: `drizzle/0066_book_collections.sql`, `drizzle/0066_book_collections.test.ts`
- Modify: `lib/db/schema.ts` (в конец файла), `lib/audit/audited-tables.ts`

**Interfaces:**
- Produces: `bookCollections`, `bookCollectionItems`, `siteSettings` (Drizzle-таблицы)

- [ ] **Step 1: Тест миграции**

```ts
// drizzle/0066_book_collections.test.ts
/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { AUDITED_TABLES } from '../lib/audit/audited-tables'

const sql = readFileSync(join(process.cwd(), 'drizzle/0066_book_collections.sql'), 'utf8')
const TABLES = ['book_collections', 'book_collection_items', 'site_settings']

describe('0066 book collections migration', () => {
  it('создаёт три таблицы', () => {
    for (const table of TABLES) expect(sql).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`)
  })

  it('ограничивает статусы подборки', () => {
    expect(sql).toContain(`CHECK ("status" IN ('draft', 'pending', 'published', 'rejected', 'hidden'))`)
  })

  it('удаляет состав вместе с подборкой и с книгой', () => {
    expect(sql).toContain('REFERENCES "book_collections"("id") ON DELETE CASCADE')
    expect(sql).toContain('REFERENCES "books"("id") ON DELETE CASCADE')
  })

  it('не даёт положить книгу в подборку дважды', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "book_collection_items_collection_book_unique"')
  })

  it('ставит аудит на все три таблицы и держит реестр в синхронизации', () => {
    for (const table of TABLES) {
      expect(AUDITED_TABLES as readonly string[]).toContain(table)
      expect(sql).toContain(`ON "${table}" FOR EACH ROW EXECUTE FUNCTION audit_capture()`)
    }
  })

  it('не создаёт строку настройки: её отсутствие значит «блок выключен»', () => {
    expect(sql).not.toContain('INSERT INTO "site_settings"')
  })
})
```

- [ ] **Step 2: Прогон — падает** (`npx jest drizzle/0066` → ENOENT)

- [ ] **Step 3: Миграция**

```sql
-- drizzle/0066_book_collections.sql
CREATE TABLE IF NOT EXISTS "book_collections" (
  "id" text PRIMARY KEY,
  "slug" text,
  "author_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "display_name" text NOT NULL DEFAULT '',
  "title" text NOT NULL,
  "description_markdown" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'draft',
  "moderation_reason" text,
  "submitted_at" timestamp,
  "edited_at" timestamp,
  "published_at" timestamp,
  "reviewed_at" timestamp,
  "reviewed_snapshot" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "book_collections_status_check" CHECK ("status" IN ('draft', 'pending', 'published', 'rejected', 'hidden'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "book_collections_slug_unique" ON "book_collections" ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_collections_author_idx" ON "book_collections" ("author_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_collections_status_idx" ON "book_collections" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "book_collection_items" (
  "id" text PRIMARY KEY,
  "collection_id" text NOT NULL REFERENCES "book_collections"("id") ON DELETE CASCADE,
  "book_id" text NOT NULL REFERENCES "books"("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  CONSTRAINT "book_collection_items_position_check" CHECK ("position" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "book_collection_items_collection_book_unique" ON "book_collection_items" ("collection_id", "book_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_collection_items_book_idx" ON "book_collection_items" ("book_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_settings" (
  "id" text PRIMARY KEY,
  "value" jsonb NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TRIGGER audit_book_collections AFTER INSERT OR UPDATE OR DELETE ON "book_collections" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_book_collection_items AFTER INSERT OR UPDATE OR DELETE ON "book_collection_items" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_site_settings AFTER INSERT OR UPDATE OR DELETE ON "site_settings" FOR EACH ROW EXECUTE FUNCTION audit_capture();
```

`lib/audit/audited-tables.ts` — добавить в конец массива `AUDITED_TABLES`:

```ts
  'book_collections',
  'book_collection_items',
  'site_settings',
```

`lib/db/schema.ts` — в конец файла:

```ts
// Подборки книг — docs/superpowers/specs/2026-09-12-book-collections-design.md

export const bookCollections = pgTable('book_collections', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text('slug'),
  authorUserId: text('author_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull().default(''),
  title: text('title').notNull(),
  descriptionMarkdown: text('description_markdown').notNull().default(''),
  status: text('status').notNull().default('draft'),
  moderationReason: text('moderation_reason'),
  submittedAt: timestamp('submitted_at', { mode: 'date' }),
  editedAt: timestamp('edited_at', { mode: 'date' }),
  publishedAt: timestamp('published_at', { mode: 'date' }),
  reviewedAt: timestamp('reviewed_at', { mode: 'date' }),
  reviewedSnapshot: jsonb('reviewed_snapshot').$type<{
    title: string
    descriptionMarkdown: string
    displayName: string
    bookIds: string[]
  }>(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  slugUnique: uniqueIndex('book_collections_slug_unique').on(t.slug),
  authorIdx: index('book_collections_author_idx').on(t.authorUserId),
  statusIdx: index('book_collections_status_idx').on(t.status),
  statusCheck: check(
    'book_collections_status_check',
    sql`${t.status} IN ('draft', 'pending', 'published', 'rejected', 'hidden')`,
  ),
}))

export const bookCollectionItems = pgTable('book_collection_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  collectionId: text('collection_id').notNull().references(() => bookCollections.id, { onDelete: 'cascade' }),
  bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
}, (t) => ({
  collectionBookUnique: uniqueIndex('book_collection_items_collection_book_unique').on(t.collectionId, t.bookId),
  bookIdx: index('book_collection_items_book_idx').on(t.bookId),
  positionCheck: check('book_collection_items_position_check', sql`${t.position} >= 1`),
}))

// Настройки сайта, которые владелец меняет без деплоя. `id` — имя настройки:
// audit_capture() берёт entity_id из поля id.
export const siteSettings = pgTable('site_settings', {
  id: text('id').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})
```

- [ ] **Step 4: Прогон** `npx jest drizzle` → PASS (включая `0040_audit_triggers.test.ts` и `migration-numbering.test.ts`)

- [ ] **Step 5: Коммит**

```bash
git add drizzle/0066_book_collections.sql drizzle/0066_book_collections.test.ts lib/db/schema.ts lib/audit/audited-tables.ts
git commit -m "feat(collections): таблицы подборок и настроек сайта с аудитом"
```

---

### Task 3: Типы, ошибки и правила

**Files:**
- Create: `lib/collections/types.ts`, `lib/collections/errors.ts`, `lib/collections/rules.ts`, `lib/collections/rules.test.ts`

**Interfaces:**
- Produces: всё из «Общих контрактов» в части `types.ts`; `CollectionError`, `isMissingCollectionsSchemaError`; из `rules.ts`: `isCollectionOwner`, `canViewCollection`, `canEditCollection`, `canDeleteCollection`, `normalizeBookIds`, `validateCollectionContent`, `snapshotOf`, `classifyCollectionEdit`, `isChangedSinceReview`, `collectionSortAt`, `nextCollectionStatus`, `actionRequiresReason`, `planContentSave`, `planSubmit`, `planAdminAction`

- [ ] **Step 1: Типы и ошибки** (без логики — тест не нужен)

```ts
// lib/collections/types.ts
export const COLLECTION_STATUSES = ['draft', 'pending', 'published', 'rejected', 'hidden'] as const
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number]

export const ADMIN_COLLECTION_ACTIONS = ['publish', 'reject', 'mark_reviewed', 'hide', 'unhide'] as const
export type AdminCollectionAction = (typeof ADMIN_COLLECTION_ACTIONS)[number]
export type CollectionAction = 'submit' | AdminCollectionAction

export const COLLECTION_LIMITS = {
  titleMax: 120,
  displayNameMax: 60,
  descriptionMax: 5000,
  booksMinToSubmit: 2,
  booksMax: 50,
} as const

export interface CollectionSnapshot {
  title: string
  descriptionMarkdown: string
  displayName: string
  bookIds: string[]
}

export interface CollectionRecord extends CollectionSnapshot {
  id: string
  slug: string | null
  authorUserId: string
  status: CollectionStatus
  moderationReason: string | null
  submittedAt: Date | null
  editedAt: Date | null
  publishedAt: Date | null
  reviewedAt: Date | null
  reviewedSnapshot: CollectionSnapshot | null
  createdAt: Date
  updatedAt: Date
}

type DateKeys = 'submittedAt' | 'editedAt' | 'publishedAt' | 'reviewedAt' | 'createdAt' | 'updatedAt'
export type SerializedCollection = Omit<CollectionRecord, DateKeys> & {
  submittedAt: string | null
  editedAt: string | null
  publishedAt: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CollectionViewer {
  userId: string | null
  isAdmin: boolean
}

export interface CollectionCoverBook {
  id: string
  title: string
  author: string
  coverUrl: string | null
}

export interface CollectionListItem {
  id: string
  slug: string
  title: string
  textsCount: number
  covers: CollectionCoverBook[]
  sortAt: string
}

export interface MyCollectionItem {
  id: string
  slug: string | null
  title: string
  status: CollectionStatus
  moderationReason: string | null
  textsCount: number
  covers: CollectionCoverBook[]
  changedAt: string
  submittedAt: string | null
}

/** Сводка разницы для очереди модерации; сама разница — lib/collections/diff.ts. */
export interface DiffSummary {
  added: number
  removed: number
  textChanged: boolean
  orderChanged: boolean
}

export interface AdminQueueItem {
  id: string
  slug: string | null
  title: string
  displayName: string
  status: CollectionStatus
  textsCount: number
  covers: CollectionCoverBook[]
  at: string
  diffSummary: DiffSummary | null
}

export interface AdminCollectionQueue {
  pending: AdminQueueItem[]
  changed: AdminQueueItem[]
  published: AdminQueueItem[]
  rejectedOrHidden: AdminQueueItem[]
}

export interface CollectionBookSearchResult extends CollectionCoverBook {
  year: string
  isArticle: boolean
  clubStatus: 'reading' | 'read' | null
}

export interface EditorBook extends CollectionBookSearchResult {
  hiddenFromCatalog: boolean
}
```

```ts
// lib/collections/errors.ts
export type CollectionErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'invalid_transition'
  | 'validation'
  | 'book_not_published'
  | 'migration_required'

export class CollectionError extends Error {
  constructor(
    public readonly code: CollectionErrorCode,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(code)
    this.name = 'CollectionError'
  }
}

/** Прод и e2e-ветка ещё без миграции 0066: таблицы нет. */
export function isMissingCollectionsSchemaError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : null
  return code === '42P01' || String((error as Error)?.message ?? '').includes('does not exist')
}
```

- [ ] **Step 2: Тест правил**

```ts
// lib/collections/rules.test.ts
import {
  actionRequiresReason, canDeleteCollection, canEditCollection, canViewCollection,
  classifyCollectionEdit, collectionSortAt, isChangedSinceReview, nextCollectionStatus,
  normalizeBookIds, planAdminAction, planContentSave, planSubmit, validateCollectionContent,
} from './rules'
import { CollectionError } from './errors'
import type { CollectionRecord } from './types'

const now = new Date('2026-09-13T12:00:00Z')
const earlier = new Date('2026-09-10T12:00:00Z')

function record(overrides: Partial<CollectionRecord> = {}): CollectionRecord {
  return {
    id: 'c1', slug: null, authorUserId: 'author', status: 'draft', moderationReason: null,
    submittedAt: null, editedAt: null, publishedAt: null, reviewedAt: null, reviewedSnapshot: null,
    createdAt: earlier, updatedAt: earlier,
    title: 'Тема', descriptionMarkdown: 'Описание', displayName: 'Аня', bookIds: ['a', 'b'],
    ...overrides,
  }
}

const guest = { userId: null, isAdmin: false }
const author = { userId: 'author', isAdmin: false }
const stranger = { userId: 'other', isAdmin: false }
const admin = { userId: 'admin', isAdmin: true }

describe('права', () => {
  it('неопубликованную видят только автор и админ', () => {
    const r = record({ status: 'pending' })
    expect(canViewCollection(r, guest)).toBe(false)
    expect(canViewCollection(r, stranger)).toBe(false)
    expect(canViewCollection(r, author)).toBe(true)
    expect(canViewCollection(r, admin)).toBe(true)
  })
  it('опубликованную видят все', () => {
    expect(canViewCollection(record({ status: 'published' }), guest)).toBe(true)
  })
  it('править может автор и админ', () => {
    expect(canEditCollection(record(), author)).toBe(true)
    expect(canEditCollection(record(), stranger)).toBe(false)
    expect(canEditCollection(record(), admin)).toBe(true)
  })
  it('автор не удаляет опубликованную, админ удаляет любую', () => {
    expect(canDeleteCollection(record({ status: 'published' }), author)).toBe(false)
    expect(canDeleteCollection(record({ status: 'hidden' }), author)).toBe(true)
    expect(canDeleteCollection(record({ status: 'published' }), admin)).toBe(true)
    expect(canDeleteCollection(record({ status: 'draft' }), stranger)).toBe(false)
  })
})

describe('normalizeBookIds', () => {
  it('убирает пустые и повторы, сохраняя порядок', () => {
    expect(normalizeBookIds([' a', 'b', 'a', '', 'c'])).toEqual(['a', 'b', 'c'])
  })
})

describe('validateCollectionContent', () => {
  const base = { title: 'Тема', descriptionMarkdown: 'Текст', displayName: 'Аня', bookIds: ['a', 'b'] }

  it('черновику достаточно названия', () => {
    expect(validateCollectionContent({ ...base, descriptionMarkdown: '', displayName: '', bookIds: [] }, 'save')).toEqual([])
    expect(validateCollectionContent({ ...base, title: '  ' }, 'save')).toEqual(['title_required'])
  })
  it('проверяет длины и число текстов', () => {
    const issues = validateCollectionContent({
      title: 'x'.repeat(121),
      descriptionMarkdown: 'x'.repeat(5001),
      displayName: 'x'.repeat(61),
      bookIds: Array.from({ length: 51 }, (_, i) => `b${i}`),
    }, 'save')
    expect(issues).toEqual(expect.arrayContaining(['title_too_long', 'description_too_long', 'display_name_too_long', 'too_many_books']))
  })
  it('ловит повторяющиеся книги', () => {
    expect(validateCollectionContent({ ...base, bookIds: ['a', 'a'] }, 'save')).toContain('duplicate_books')
  })
  it('для отправки нужны описание, подпись и два опубликованных текста', () => {
    expect(validateCollectionContent({ ...base, descriptionMarkdown: '', displayName: '' }, 'submit', new Set(['a', 'b'])))
      .toEqual(expect.arrayContaining(['description_required', 'display_name_required']))
    expect(validateCollectionContent(base, 'submit', new Set(['a']))).toContain('too_few_books')
    expect(validateCollectionContent(base, 'submit', new Set(['a', 'b']))).toEqual([])
  })
})

describe('classifyCollectionEdit', () => {
  const prev = { title: 'Т', descriptionMarkdown: 'О', displayName: 'П', bookIds: ['a', 'b', 'c'] }
  it('без изменений', () => expect(classifyCollectionEdit(prev, { ...prev, bookIds: [...prev.bookIds] })).toBe('none'))
  it('только порядок', () => expect(classifyCollectionEdit(prev, { ...prev, bookIds: ['b', 'a', 'c'] })).toBe('order_only'))
  it('добавление текста', () => expect(classifyCollectionEdit(prev, { ...prev, bookIds: ['a', 'b', 'c', 'd'] })).toBe('content'))
  it('удаление текста', () => expect(classifyCollectionEdit(prev, { ...prev, bookIds: ['a', 'b'] })).toBe('content'))
  it('правка подписи', () => expect(classifyCollectionEdit(prev, { ...prev, displayName: 'Другое' })).toBe('content'))
})

describe('isChangedSinceReview и сортировка', () => {
  it('опубликованная, правленная после проверки', () => {
    expect(isChangedSinceReview(record({ status: 'published', reviewedAt: earlier, editedAt: now }))).toBe(true)
    expect(isChangedSinceReview(record({ status: 'published', reviewedAt: now, editedAt: earlier }))).toBe(false)
    expect(isChangedSinceReview(record({ status: 'pending', reviewedAt: earlier, editedAt: now }))).toBe(false)
  })
  it('сортировка по последнему из публикации и правки', () => {
    expect(collectionSortAt(record({ publishedAt: earlier, editedAt: now }))).toEqual(now)
    expect(collectionSortAt(record({ publishedAt: now, editedAt: null }))).toEqual(now)
    expect(collectionSortAt(record())).toBeNull()
  })
})

describe('переходы статусов', () => {
  it('разрешённые', () => {
    expect(nextCollectionStatus('draft', 'submit')).toBe('pending')
    expect(nextCollectionStatus('rejected', 'submit')).toBe('pending')
    expect(nextCollectionStatus('hidden', 'submit')).toBe('pending')
    expect(nextCollectionStatus('pending', 'publish')).toBe('published')
    expect(nextCollectionStatus('pending', 'reject')).toBe('rejected')
    expect(nextCollectionStatus('published', 'mark_reviewed')).toBe('published')
    expect(nextCollectionStatus('published', 'hide')).toBe('hidden')
    expect(nextCollectionStatus('hidden', 'unhide')).toBe('published')
  })
  it('запрещённые бросают invalid_transition', () => {
    expect(() => nextCollectionStatus('draft', 'publish')).toThrow(CollectionError)
    expect(() => nextCollectionStatus('published', 'submit')).toThrow('invalid_transition')
  })
  it('причина нужна для reject и hide', () => {
    expect(actionRequiresReason('reject')).toBe(true)
    expect(actionRequiresReason('hide')).toBe(true)
    expect(actionRequiresReason('publish')).toBe(false)
  })
})

describe('planContentSave', () => {
  const published = record({ status: 'published', publishedAt: earlier, reviewedAt: earlier })

  it('автор правит текст опубликованной — обновляется editedAt', () => {
    const { kind, patch } = planContentSave(published, { ...published, title: '  Новое  ' }, 'author', now)
    expect(kind).toBe('content')
    expect(patch).toMatchObject({ title: 'Новое', editedAt: now, updatedAt: now })
    expect(patch.reviewedAt).toBeUndefined()
  })
  it('автор только переставил — editedAt не трогается', () => {
    const { kind, patch } = planContentSave(published, { ...published, bookIds: ['b', 'a'] }, 'author', now)
    expect(kind).toBe('order_only')
    expect(patch.editedAt).toBeUndefined()
  })
  it('правка админом опубликованной считается проверкой', () => {
    const { patch } = planContentSave(published, { ...published, title: 'Правка админа' }, 'admin', now)
    expect(patch.editedAt).toBeUndefined()
    expect(patch.reviewedAt).toEqual(now)
    expect(patch.reviewedSnapshot).toEqual({ title: 'Правка админа', descriptionMarkdown: 'Описание', displayName: 'Аня', bookIds: ['a', 'b'] })
  })
})

describe('planSubmit', () => {
  it('переводит в pending и ставит submittedAt', () => {
    expect(planSubmit(record(), now, new Set(['a', 'b']))).toEqual({ status: 'pending', submittedAt: now, updatedAt: now })
  })
  it('отказывает с перечнем проблем', () => {
    try {
      planSubmit(record({ displayName: '' }), now, new Set(['a']))
      throw new Error('should throw')
    } catch (error) {
      expect(error).toBeInstanceOf(CollectionError)
      expect((error as CollectionError).details.issues).toEqual(expect.arrayContaining(['display_name_required', 'too_few_books']))
    }
  })
})

describe('planAdminAction', () => {
  it('первая публикация присваивает адрес, очищает причину и снимает снимок', () => {
    const patch = planAdminAction(record({ status: 'pending', moderationReason: 'старое' }), 'publish', { reason: null, now, slug: 'tema' })
    expect(patch).toMatchObject({ status: 'published', slug: 'tema', moderationReason: null, publishedAt: now, reviewedAt: now })
    expect(patch.reviewedSnapshot?.bookIds).toEqual(['a', 'b'])
  })
  it('повторная публикация адрес не меняет', () => {
    const patch = planAdminAction(record({ status: 'hidden', slug: 'tema' }), 'unhide', { reason: null, now, slug: null })
    expect(patch.slug).toBeUndefined()
    expect(patch.status).toBe('published')
  })
  it('reject и hide без причины — validation', () => {
    expect(() => planAdminAction(record({ status: 'pending' }), 'reject', { reason: '  ', now, slug: null })).toThrow('validation')
    expect(planAdminAction(record({ status: 'published' }), 'hide', { reason: 'Причина', now, slug: null }))
      .toMatchObject({ status: 'hidden', moderationReason: 'Причина' })
  })
  it('mark_reviewed обновляет только проверку', () => {
    const patch = planAdminAction(record({ status: 'published', slug: 's' }), 'mark_reviewed', { reason: null, now, slug: null })
    expect(patch).toMatchObject({ status: 'published', reviewedAt: now })
    expect(patch.publishedAt).toBeUndefined()
  })
})
```

- [ ] **Step 3: Прогон — падает** (`npx jest lib/collections/rules.test.ts`)

- [ ] **Step 4: Реализация**

```ts
// lib/collections/rules.ts
import { CollectionError } from './errors'
import {
  COLLECTION_LIMITS,
  type AdminCollectionAction,
  type CollectionAction,
  type CollectionRecord,
  type CollectionSnapshot,
  type CollectionStatus,
  type CollectionViewer,
} from './types'

type Owned = Pick<CollectionRecord, 'authorUserId' | 'status'>

export function isCollectionOwner(record: Pick<CollectionRecord, 'authorUserId'>, viewer: CollectionViewer): boolean {
  return viewer.userId !== null && viewer.userId === record.authorUserId
}

export function canViewCollection(record: Owned, viewer: CollectionViewer): boolean {
  return record.status === 'published' || viewer.isAdmin || isCollectionOwner(record, viewer)
}

export function canEditCollection(record: Owned, viewer: CollectionViewer): boolean {
  return viewer.isAdmin || isCollectionOwner(record, viewer)
}

export function canDeleteCollection(record: Owned, viewer: CollectionViewer): boolean {
  if (viewer.isAdmin) return true
  return isCollectionOwner(record, viewer) && record.status !== 'published'
}

export function normalizeBookIds(bookIds: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of bookIds) {
    const id = raw.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

export type CollectionValidationIssue =
  | 'title_required' | 'title_too_long'
  | 'description_required' | 'description_too_long'
  | 'display_name_required' | 'display_name_too_long'
  | 'too_few_books' | 'too_many_books' | 'duplicate_books'

export function validateCollectionContent(
  content: CollectionSnapshot,
  mode: 'save' | 'submit',
  publicBookIds: ReadonlySet<string> = new Set(),
): CollectionValidationIssue[] {
  const issues: CollectionValidationIssue[] = []
  const title = content.title.trim()
  const displayName = content.displayName.trim()
  if (!title) issues.push('title_required')
  if (title.length > COLLECTION_LIMITS.titleMax) issues.push('title_too_long')
  if (content.descriptionMarkdown.length > COLLECTION_LIMITS.descriptionMax) issues.push('description_too_long')
  if (displayName.length > COLLECTION_LIMITS.displayNameMax) issues.push('display_name_too_long')
  if (content.bookIds.length > COLLECTION_LIMITS.booksMax) issues.push('too_many_books')
  if (normalizeBookIds(content.bookIds).length !== content.bookIds.length) issues.push('duplicate_books')
  if (mode === 'submit') {
    if (!content.descriptionMarkdown.trim()) issues.push('description_required')
    if (!displayName) issues.push('display_name_required')
    const publicCount = content.bookIds.filter((id) => publicBookIds.has(id)).length
    if (publicCount < COLLECTION_LIMITS.booksMinToSubmit) issues.push('too_few_books')
  }
  return issues
}

export function snapshotOf(content: CollectionSnapshot): CollectionSnapshot {
  return {
    title: content.title,
    descriptionMarkdown: content.descriptionMarkdown,
    displayName: content.displayName,
    bookIds: [...content.bookIds],
  }
}

export type CollectionEditKind = 'none' | 'order_only' | 'content'

export function classifyCollectionEdit(prev: CollectionSnapshot, next: CollectionSnapshot): CollectionEditKind {
  const textChanged = prev.title !== next.title
    || prev.descriptionMarkdown !== next.descriptionMarkdown
    || prev.displayName !== next.displayName
  const prevSet = new Set(prev.bookIds)
  const setChanged = prev.bookIds.length !== next.bookIds.length || next.bookIds.some((id) => !prevSet.has(id))
  if (textChanged || setChanged) return 'content'
  return prev.bookIds.some((id, index) => next.bookIds[index] !== id) ? 'order_only' : 'none'
}

export function isChangedSinceReview(record: Pick<CollectionRecord, 'status' | 'editedAt' | 'reviewedAt'>): boolean {
  if (record.status !== 'published' || !record.editedAt) return false
  return !record.reviewedAt || record.editedAt.getTime() > record.reviewedAt.getTime()
}

export function collectionSortAt(record: Pick<CollectionRecord, 'publishedAt' | 'editedAt'>): Date | null {
  const times = [record.publishedAt, record.editedAt].filter((d): d is Date => d !== null)
  if (times.length === 0) return null
  return new Date(Math.max(...times.map((d) => d.getTime())))
}

const TRANSITIONS: Record<CollectionAction, { from: readonly CollectionStatus[]; to: CollectionStatus }> = {
  submit: { from: ['draft', 'rejected', 'hidden'], to: 'pending' },
  publish: { from: ['pending'], to: 'published' },
  reject: { from: ['pending'], to: 'rejected' },
  mark_reviewed: { from: ['published'], to: 'published' },
  hide: { from: ['published'], to: 'hidden' },
  unhide: { from: ['hidden'], to: 'published' },
}

export function nextCollectionStatus(status: CollectionStatus, action: CollectionAction): CollectionStatus {
  const transition = TRANSITIONS[action]
  if (!transition.from.includes(status)) {
    throw new CollectionError('invalid_transition', { status, action })
  }
  return transition.to
}

export function actionRequiresReason(action: CollectionAction): boolean {
  return action === 'reject' || action === 'hide'
}

export interface CollectionContentPatch {
  title: string
  descriptionMarkdown: string
  displayName: string
  updatedAt: Date
  editedAt?: Date
  reviewedAt?: Date
  reviewedSnapshot?: CollectionSnapshot
}

export function planContentSave(
  current: CollectionRecord,
  next: CollectionSnapshot,
  by: 'author' | 'admin',
  now: Date,
): { kind: CollectionEditKind; patch: CollectionContentPatch } {
  const normalized: CollectionSnapshot = {
    title: next.title.trim(),
    descriptionMarkdown: next.descriptionMarkdown,
    displayName: next.displayName.trim(),
    bookIds: normalizeBookIds(next.bookIds),
  }
  const kind = classifyCollectionEdit(snapshotOf(current), normalized)
  const patch: CollectionContentPatch = {
    title: normalized.title,
    descriptionMarkdown: normalized.descriptionMarkdown,
    displayName: normalized.displayName,
    updatedAt: now,
  }
  if (by === 'author' && kind === 'content') patch.editedAt = now
  if (by === 'admin' && current.status === 'published') {
    patch.reviewedAt = now
    patch.reviewedSnapshot = normalized
  }
  return { kind, patch }
}

export interface CollectionStatusPatch {
  status: CollectionStatus
  updatedAt: Date
  moderationReason?: string | null
  submittedAt?: Date
  publishedAt?: Date
  reviewedAt?: Date
  reviewedSnapshot?: CollectionSnapshot
  slug?: string
}

export function planSubmit(current: CollectionRecord, now: Date, publicBookIds: ReadonlySet<string>): CollectionStatusPatch {
  const status = nextCollectionStatus(current.status, 'submit')
  const issues = validateCollectionContent(snapshotOf(current), 'submit', publicBookIds)
  if (issues.length > 0) throw new CollectionError('validation', { issues })
  return { status, submittedAt: now, updatedAt: now }
}

export function planAdminAction(
  current: CollectionRecord,
  action: AdminCollectionAction,
  input: { reason: string | null; now: Date; slug: string | null },
): CollectionStatusPatch {
  const status = nextCollectionStatus(current.status, action)
  const reason = input.reason?.trim() ?? ''
  if (actionRequiresReason(action) && !reason) {
    throw new CollectionError('validation', { issues: ['reason_required'] })
  }
  const patch: CollectionStatusPatch = { status, updatedAt: input.now }
  if (action === 'publish' || action === 'unhide') {
    patch.moderationReason = null
    patch.publishedAt = input.now
    patch.reviewedAt = input.now
    patch.reviewedSnapshot = snapshotOf(current)
    if (!current.slug) {
      if (!input.slug) throw new Error('slug is required for the first publication')
      patch.slug = input.slug
    }
  } else if (action === 'reject' || action === 'hide') {
    patch.moderationReason = reason
  } else {
    patch.reviewedAt = input.now
    patch.reviewedSnapshot = snapshotOf(current)
  }
  return patch
}
```

- [ ] **Step 5: Прогон** `npx jest lib/collections/rules.test.ts` → PASS

- [ ] **Step 6: Коммит**

```bash
git add lib/collections/types.ts lib/collections/errors.ts lib/collections/rules.ts lib/collections/rules.test.ts
git commit -m "feat(collections): правила статусов, прав и правок"
```

---

### Task 4: Разница со снимком

**Files:**
- Create: `lib/collections/diff.ts`, `lib/collections/diff.test.ts`

**Interfaces:**
- Produces: `diffCollection(before: CollectionSnapshot, after: CollectionSnapshot): CollectionDiff`, `summarizeDiff(diff: CollectionDiff): DiffSummary`, типы `CollectionDiff`, `DiffSummary`, `FieldChange`

- [ ] **Step 1: Тест**

```ts
// lib/collections/diff.test.ts
import { diffCollection, summarizeDiff } from './diff'

const base = { title: 'Т', descriptionMarkdown: 'Раз', displayName: 'Аня', bookIds: ['a', 'b', 'c'] }

describe('diffCollection', () => {
  it('пустая разница', () => {
    const diff = diffCollection(base, { ...base, bookIds: [...base.bookIds] })
    expect(diff).toEqual({ added: [], removed: [], moved: [], title: null, description: null, displayName: null })
    expect(summarizeDiff(diff)).toEqual({ added: 0, removed: 0, textChanged: false, orderChanged: false })
  })

  it('добавленные и убранные', () => {
    const diff = diffCollection(base, { ...base, bookIds: ['a', 'c', 'd'] })
    expect(diff.added).toEqual(['d'])
    expect(diff.removed).toEqual(['b'])
    expect(diff.moved).toEqual([])
  })

  it('перестановка с позициями «было → стало»', () => {
    const diff = diffCollection(base, { ...base, bookIds: ['b', 'a', 'c'] })
    expect(diff.moved).toEqual([
      { bookId: 'b', from: 2, to: 1 },
      { bookId: 'a', from: 1, to: 2 },
    ])
    expect(summarizeDiff(diff).orderChanged).toBe(true)
  })

  it('удаление не считается перестановкой остальных', () => {
    expect(diffCollection(base, { ...base, bookIds: ['b', 'c'] }).moved).toEqual([])
  })

  it('изменения полей', () => {
    const diff = diffCollection(base, { ...base, title: 'Новое', descriptionMarkdown: 'Два' })
    expect(diff.title).toEqual({ before: 'Т', after: 'Новое' })
    expect(diff.description).toEqual({ before: 'Раз', after: 'Два' })
    expect(diff.displayName).toBeNull()
    expect(summarizeDiff(diff).textChanged).toBe(true)
  })
})
```

- [ ] **Step 2: Прогон — падает**

- [ ] **Step 3: Реализация**

```ts
// lib/collections/diff.ts
import type { CollectionSnapshot, DiffSummary } from './types'

export type { DiffSummary }

export interface FieldChange { before: string; after: string }

export interface CollectionDiff {
  added: string[]
  removed: string[]
  moved: Array<{ bookId: string; from: number; to: number }>
  title: FieldChange | null
  description: FieldChange | null
  displayName: FieldChange | null
}

function field(before: string, after: string): FieldChange | null {
  return before === after ? null : { before, after }
}

export function diffCollection(before: CollectionSnapshot, after: CollectionSnapshot): CollectionDiff {
  const beforeSet = new Set(before.bookIds)
  const afterSet = new Set(after.bookIds)
  // Перестановкой считаем смену относительного порядка книг, которые есть в обеих версиях,
  // чтобы добавление или удаление одной книги не помечало «переставленными» все остальные.
  const commonBefore = before.bookIds.filter((id) => afterSet.has(id))
  const commonAfter = after.bookIds.filter((id) => beforeSet.has(id))
  const moved = commonAfter
    .filter((id, index) => commonBefore[index] !== id)
    .map((id) => ({ bookId: id, from: before.bookIds.indexOf(id) + 1, to: after.bookIds.indexOf(id) + 1 }))
  return {
    added: after.bookIds.filter((id) => !beforeSet.has(id)),
    removed: before.bookIds.filter((id) => !afterSet.has(id)),
    moved,
    title: field(before.title, after.title),
    description: field(before.descriptionMarkdown, after.descriptionMarkdown),
    displayName: field(before.displayName, after.displayName),
  }
}

export function summarizeDiff(diff: CollectionDiff): DiffSummary {
  return {
    added: diff.added.length,
    removed: diff.removed.length,
    textChanged: Boolean(diff.title || diff.description || diff.displayName),
    orderChanged: diff.moved.length > 0,
  }
}
```

- [ ] **Step 4: Прогон** → PASS

- [ ] **Step 5: Коммит**

```bash
git add lib/collections/diff.ts lib/collections/diff.test.ts
git commit -m "feat(collections): разница подборки с последней проверкой"
```

---

### Task 5: Форматирование

**Files:**
- Create: `lib/collections/format.ts`, `lib/collections/format.test.ts`

**Interfaces:**
- Produces: `pluralRu(n, one, few, many)`, `textsCount(n)`, `collectionsCount(n)`, `markdownExcerpt(markdown, max?)`, `formatChangedAt(date, now)` → `{ relative, absolute }`, `formatDiffSummary(summary)`, `collectionIssueText(issue)`

- [ ] **Step 1: Тест**

```ts
// lib/collections/format.test.ts
import { collectionIssueText, collectionsCount, formatChangedAt, formatDiffSummary, markdownExcerpt, textsCount } from './format'

describe('склонения', () => {
  it.each([[1, '1 текст'], [2, '2 текста'], [5, '5 текстов'], [11, '11 текстов'], [21, '21 текст'], [22, '22 текста']])('%i', (n, text) => {
    expect(textsCount(n)).toBe(text)
  })
  it('подборки', () => {
    expect(collectionsCount(4)).toBe('4 подборки')
    expect(collectionsCount(5)).toBe('5 подборок')
  })
})

describe('markdownExcerpt', () => {
  it('убирает разметку и обрезает по слову', () => {
    const md = '## Зачем\n\nМы **начали** с [Поланьи](https://x.y) и\n- списка\n- пунктов'
    expect(markdownExcerpt(md, 200)).toBe('Зачем Мы начали с Поланьи и списка пунктов')
    expect(markdownExcerpt('раз два три четыре', 9)).toBe('раз два…')
  })
})

describe('formatChangedAt', () => {
  const now = new Date(2026, 8, 13, 12)
  it('сегодня, вчера, дни и недели', () => {
    expect(formatChangedAt(new Date(2026, 8, 13, 9), now).relative).toBe('сегодня')
    expect(formatChangedAt(new Date(2026, 8, 12, 9), now).relative).toBe('вчера')
    expect(formatChangedAt(new Date(2026, 8, 10, 9), now).relative).toBe('3 дня назад')
    expect(formatChangedAt(new Date(2026, 7, 30, 9), now).relative).toBe('2 недели назад')
    expect(formatChangedAt(new Date(2026, 8, 10, 9), now).absolute).toBe('10 сентября')
  })
})

describe('formatDiffSummary', () => {
  it('складывает части через точку', () => {
    expect(formatDiffSummary({ added: 1, removed: 1, textChanged: true, orderChanged: true })).toBe('+1 · −1 · текст · порядок')
    expect(formatDiffSummary({ added: 0, removed: 0, textChanged: false, orderChanged: false })).toBe('')
  })
})

describe('collectionIssueText', () => {
  it('переводит коды', () => {
    expect(collectionIssueText('too_few_books')).toBe('Нужно минимум два текста из каталога')
    expect(collectionIssueText('unknown_code')).toBe('Не удалось сохранить подборку')
  })
})
```

- [ ] **Step 2: Прогон — падает**

- [ ] **Step 3: Реализация**

```ts
// lib/collections/format.ts
import type { DiffSummary } from './types'

export function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

export function textsCount(n: number): string {
  return `${n} ${pluralRu(n, 'текст', 'текста', 'текстов')}`
}

export function collectionsCount(n: number): string {
  return `${n} ${pluralRu(n, 'подборка', 'подборки', 'подборок')}`
}

export function markdownExcerpt(markdown: string, max = 200): string {
  const plain = markdown
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_`>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= max) return plain
  const cut = plain.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function formatChangedAt(date: Date, now: Date): { relative: string; absolute: string } {
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  let relative: string
  if (days <= 0) relative = 'сегодня'
  else if (days === 1) relative = 'вчера'
  else if (days < 14) relative = `${days} ${pluralRu(days, 'день', 'дня', 'дней')} назад`
  else {
    const weeks = Math.floor(days / 7)
    relative = `${weeks} ${pluralRu(weeks, 'неделю', 'недели', 'недель')} назад`
  }
  const absolute = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  return { relative, absolute }
}

export function formatDiffSummary(summary: DiffSummary): string {
  return [
    summary.added > 0 ? `+${summary.added}` : null,
    summary.removed > 0 ? `−${summary.removed}` : null,
    summary.textChanged ? 'текст' : null,
    summary.orderChanged ? 'порядок' : null,
  ].filter(Boolean).join(' · ')
}

const ISSUE_TEXT: Record<string, string> = {
  title_required: 'Напишите название',
  title_too_long: 'Название длиннее 120 символов',
  description_required: 'Напишите описание',
  description_too_long: 'Описание длиннее 5000 символов',
  display_name_required: 'Укажите подпись',
  display_name_too_long: 'Подпись длиннее 60 символов',
  too_few_books: 'Нужно минимум два текста из каталога',
  too_many_books: 'В подборке не больше 50 текстов',
  duplicate_books: 'Один текст добавлен дважды',
  reason_required: 'Напишите причину',
  book_not_published: 'Эта книга ещё не опубликована в каталоге',
  migration_required: 'Подборки ещё не включены на сервере',
}

export function collectionIssueText(issue: string): string {
  return ISSUE_TEXT[issue] ?? 'Не удалось сохранить подборку'
}
```

- [ ] **Step 4: Прогон** → PASS (если `absolute` в CI отличается из-за ICU — в Node 18+ полный ICU есть; при падении проверь `node -p "new Date(2026,8,10).toLocaleDateString('ru-RU',{day:'numeric',month:'long'})"`)

- [ ] **Step 5: Коммит**

```bash
git add lib/collections/format.ts lib/collections/format.test.ts
git commit -m "feat(collections): склонения, выжимка описания и тексты ошибок"
```

---

### Task 6: Книги по списку id, состояние записи пользователя, настройки сайта

**Files:**
- Modify: `lib/books.ts` (добавить функции после `fetchBookBySlug`; в импорт `drizzle-orm` добавить `inArray`, если его нет)
- Modify: `lib/signup-books.ts` (добавить в конец)
- Create: `lib/books-order.test.ts`, `lib/site-settings.ts`, `lib/site-settings.test.ts`

**Interfaces:**
- Produces: `fetchBooksByIds(ids: readonly string[], dbClient?): Promise<BookWithCover[]>` (порядок как в `ids`), `orderRowsByIds<T>(ids, byId): T[]`, `getUserSignupState(userId): Promise<UserSignupState>`, `UserSignupState { name; contacts; selectedBookIds: string[]; personalStatuses: Record<string, PersonalBookStatus> }`, `getSiteSetting`, `setSiteSetting`, `parseSiteSetting`, `SITE_SETTING_DEFAULTS`

- [ ] **Step 1: Тесты**

```ts
// lib/books-order.test.ts
import { orderRowsByIds } from '@/lib/books'

jest.mock('@/lib/db', () => ({ db: {} }))

describe('orderRowsByIds', () => {
  it('сохраняет порядок id и пропускает отсутствующие', () => {
    const byId = new Map([['b', { id: 'b' }], ['a', { id: 'a' }]])
    expect(orderRowsByIds(['a', 'x', 'b'], byId)).toEqual([{ id: 'a' }, { id: 'b' }])
  })
})
```

```ts
// lib/site-settings.test.ts
import { getSiteSetting, parseSiteSetting, SITE_SETTING_DEFAULTS } from '@/lib/site-settings'

jest.mock('@/lib/db', () => ({ db: {} }))

function clientReturning(rows: unknown[] | Error) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => (rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows)),
  }
  return { select: () => chain } as never
}

describe('site settings', () => {
  it('по умолчанию блок подборок выключен', () => {
    expect(SITE_SETTING_DEFAULTS.collections_home_block_enabled).toBe(false)
  })
  it('значение неверного типа заменяется значением по умолчанию', () => {
    expect(parseSiteSetting('collections_home_block_enabled', 'yes')).toBe(false)
    expect(parseSiteSetting('collections_home_block_enabled', true)).toBe(true)
  })
  it('нет строки — значение по умолчанию', async () => {
    await expect(getSiteSetting('collections_home_block_enabled', clientReturning([]))).resolves.toBe(false)
  })
  it('читает сохранённое значение', async () => {
    await expect(getSiteSetting('collections_home_block_enabled', clientReturning([{ value: true }]))).resolves.toBe(true)
  })
  it('таблицы ещё нет — значение по умолчанию', async () => {
    const error = Object.assign(new Error('relation "site_settings" does not exist'), { code: '42P01' })
    await expect(getSiteSetting('collections_home_block_enabled', clientReturning(error))).resolves.toBe(false)
  })
})
```

- [ ] **Step 2: Прогон — падает**

- [ ] **Step 3: Реализация**

`lib/books.ts`:

```ts
export function orderRowsByIds<T>(ids: readonly string[], byId: ReadonlyMap<string, T>): T[] {
  return ids.flatMap((id) => {
    const row = byId.get(id)
    return row ? [row] : []
  })
}

/** Книги по списку id в заданном порядке, включая скрытые (видимость решает вызывающий). */
export async function fetchBooksByIds(ids: readonly string[], dbClient: typeof db = db): Promise<BookWithCover[]> {
  const unique = Array.from(new Set(ids))
  if (unique.length === 0) return []
  const rows = await dbClient.select().from(books).where(inArray(books.id, unique))
  const signupCounts = await dbClient
    .select({ bookId: signupBooks.bookId, count: sql<number>`count(*)::int` })
    .from(signupBooks)
    .where(inArray(signupBooks.bookId, unique))
    .groupBy(signupBooks.bookId)
  const summaryCounts = await dbClient
    .select({ bookId: bookSummaries.bookId, count: sql<number>`count(*)::int` })
    .from(bookSummaries)
    .where(and(eq(bookSummaries.status, 'published'), inArray(bookSummaries.bookId, unique)))
    .groupBy(bookSummaries.bookId)
    .catch(() => [])
  const signupById = new Map(signupCounts.map((c) => [c.bookId, Number(c.count)]))
  const summaryById = new Map(summaryCounts.map((c) => [c.bookId, Number(c.count)]))
  const byId = new Map(rows.map((row) => [row.id, row]))
  return orderRowsByIds(unique, byId).map((row) => rowToBook(row, signupById.get(row.id) ?? 0, summaryById.get(row.id) ?? 0))
}
```

`lib/signup-books.ts` (в конец; `users` и `signupBooks` уже импортированы):

```ts
export interface UserSignupState {
  name: string
  contacts: string
  selectedBookIds: string[]
  personalStatuses: Record<string, PersonalBookStatus>
}

export async function getUserSignupState(userId: string): Promise<UserSignupState> {
  const [user] = await db
    .select({ name: users.name, contacts: users.contacts })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  const rows = await db
    .select({ bookId: signupBooks.bookId, personalStatus: signupBooks.personalStatus })
    .from(signupBooks)
    .where(eq(signupBooks.userId, userId))
  return {
    name: user?.name ?? '',
    contacts: user?.contacts ?? '',
    selectedBookIds: rows.map((row) => row.bookId),
    personalStatuses: Object.fromEntries(rows.map((row) => [row.bookId, (row.personalStatus as PersonalBookStatus) ?? null])),
  }
}
```

```ts
// lib/site-settings.ts
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { siteSettings } from '@/lib/db/schema'
import { isMissingCollectionsSchemaError } from '@/lib/collections/errors'

type DbLike = typeof db

export interface SiteSettingValues {
  collections_home_block_enabled: boolean
}

export type SiteSettingKey = keyof SiteSettingValues

export const SITE_SETTING_DEFAULTS: SiteSettingValues = {
  collections_home_block_enabled: false,
}

export function parseSiteSetting<K extends SiteSettingKey>(key: K, raw: unknown): SiteSettingValues[K] {
  const fallback = SITE_SETTING_DEFAULTS[key]
  return typeof raw === typeof fallback ? (raw as SiteSettingValues[K]) : fallback
}

export async function getSiteSetting<K extends SiteSettingKey>(key: K, client: DbLike = db): Promise<SiteSettingValues[K]> {
  try {
    const [row] = await client
      .select({ value: siteSettings.value })
      .from(siteSettings)
      .where(eq(siteSettings.id, key))
      .limit(1)
    return parseSiteSetting(key, row?.value)
  } catch (error) {
    if (isMissingCollectionsSchemaError(error)) return SITE_SETTING_DEFAULTS[key]
    throw error
  }
}

export async function setSiteSetting<K extends SiteSettingKey>(tx: DbLike, key: K, value: SiteSettingValues[K]): Promise<void> {
  const updatedAt = new Date()
  await tx
    .insert(siteSettings)
    .values({ id: key, value, updatedAt })
    .onConflictDoUpdate({ target: siteSettings.id, set: { value, updatedAt } })
}
```

- [ ] **Step 4: Прогон** `npx jest lib/books-order.test.ts lib/site-settings.test.ts lib/signup-books` → PASS

- [ ] **Step 5: Коммит**

```bash
git add lib/books.ts lib/books-order.test.ts lib/signup-books.ts lib/site-settings.ts lib/site-settings.test.ts
git commit -m "feat(collections): книги по списку id, состояние записи и настройки сайта"
```

---

### Task 7: Слой БД `lib/collections/repo.ts`

**Files:**
- Create: `lib/collections/repo.ts`, `lib/collections/repo.test.ts`

**Interfaces:**
- Consumes: `rules.ts`, `diff.ts`, `lib/slug.ts`, `fetchBooksByIds`
- Produces: функции из «Общих контрактов» (`repo.ts`)

- [ ] **Step 1: Тест на фейковой БД**

Codecov требует 70% покрытия изменённого кода, а `lib/**` не исключён — репозиторий нужно покрыть. Фейковый клиент отдаёт заранее заданные результаты запросов по очереди вызовов `select`.

```ts
// lib/collections/repo.test.ts
/**
 * @jest-environment node
 */
jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('@/lib/books', () => ({ fetchBooksByIds: jest.fn() }))

import { applyAdminCollectionAction, listAdminQueue, listPublishedCollections, saveCollectionContent, searchPublishedBooks } from './repo'
import { CollectionError } from './errors'

type Result = unknown[]

/** Цепочка drizzle: любые методы возвращают саму цепочку, await отдаёт очередной результат. */
function fakeDb(selectResults: Result[]) {
  const writes: Array<{ op: string; args: unknown[] }> = []
  const chain = (result: Promise<unknown>): unknown => new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return result.then.bind(result)
      if (prop === 'catch') return result.catch.bind(result)
      return (...args: unknown[]) => {
        if (prop === 'set' || prop === 'values') writes[writes.length - 1]?.args.push(args[0])
        return chain(result)
      }
    },
  })
  return {
    writes,
    client: {
      select: () => chain(Promise.resolve(selectResults.shift() ?? [])),
      update: () => { writes.push({ op: 'update', args: [] }); return chain(Promise.resolve([])) },
      insert: () => { writes.push({ op: 'insert', args: [] }); return chain(Promise.resolve([])) },
      delete: () => { writes.push({ op: 'delete', args: [] }); return chain(Promise.resolve([])) },
    } as never,
  }
}

const t = (iso: string) => new Date(iso)
function row(overrides: Record<string, unknown>) {
  return {
    id: 'c1', slug: 'tema', authorUserId: 'u1', displayName: 'Аня', title: 'Тема', descriptionMarkdown: 'Текст',
    status: 'published', moderationReason: null, submittedAt: null, editedAt: null,
    publishedAt: t('2026-09-01T10:00:00Z'), reviewedAt: t('2026-09-01T10:00:00Z'), reviewedSnapshot: null,
    createdAt: t('2026-08-30T10:00:00Z'), updatedAt: t('2026-09-01T10:00:00Z'),
    ...overrides,
  }
}
const book = (id: string, visibility = 'published') => ({ id, title: `Книга ${id}`, author: 'Автор', coverUrl: null, visibility, readingStatus: null, publishedDate: '2020', type: 'book' })

describe('listPublishedCollections', () => {
  it('скрывает подборки без видимых книг и сортирует свежие первыми', async () => {
    const { client } = fakeDb([
      [row({ id: 'old' }), row({ id: 'fresh', slug: 'fresh', editedAt: t('2026-09-10T10:00:00Z') }), row({ id: 'empty', slug: 'empty' })],
      [
        { collectionId: 'old', bookId: 'a' }, { collectionId: 'old', bookId: 'h' },
        { collectionId: 'fresh', bookId: 'b' },
        { collectionId: 'empty', bookId: 'h' },
      ],
      [book('a'), book('b'), book('h', 'hidden')],
    ])
    const list = await listPublishedCollections(client)
    expect(list.map((item) => item.id)).toEqual(['fresh', 'old'])
    expect(list[1]).toMatchObject({ textsCount: 1, covers: [{ id: 'a' }] })
  })
})

describe('listAdminQueue', () => {
  it('раскладывает по секциям', async () => {
    const { client } = fakeDb([
      [
        row({ id: 'p', status: 'pending', slug: null, submittedAt: t('2026-09-11T10:00:00Z') }),
        row({ id: 'ch', editedAt: t('2026-09-12T10:00:00Z'), reviewedSnapshot: { title: 'Тема', descriptionMarkdown: 'Текст', displayName: 'Аня', bookIds: ['a'] } }),
        row({ id: 'ok' }),
        row({ id: 'r', status: 'rejected' }),
        row({ id: 'd', status: 'draft' }),
      ],
      [{ collectionId: 'ch', bookId: 'a' }, { collectionId: 'ch', bookId: 'b' }],
      [book('a'), book('b')],
    ])
    const queue = await listAdminQueue(client)
    expect(queue.pending.map((i) => i.id)).toEqual(['p'])
    expect(queue.changed.map((i) => i.id)).toEqual(['ch'])
    expect(queue.changed[0].diffSummary).toEqual({ added: 1, removed: 0, textChanged: false, orderChanged: false })
    expect(queue.published.map((i) => i.id)).toEqual(['ok'])
    expect(queue.rejectedOrHidden.map((i) => i.id)).toEqual(['r'])
  })
})

describe('saveCollectionContent', () => {
  it('отказывает, если добавляемая книга не опубликована', async () => {
    const { client } = fakeDb([
      [row({ status: 'draft' })],
      [{ collectionId: 'c1', bookId: 'a' }],
      [], // среди добавляемых опубликованных нет
    ])
    await expect(saveCollectionContent(client, {
      id: 'c1',
      content: { title: 'Тема', descriptionMarkdown: 'Текст', displayName: 'Аня', bookIds: ['a', 'hidden'] },
      by: 'author',
      now: new Date(),
    })).rejects.toMatchObject({ code: 'book_not_published' })
  })

  it('перестановка перезаписывает состав, но не трогает editedAt', async () => {
    const { client, writes } = fakeDb([
      [row({})],
      [{ collectionId: 'c1', bookId: 'a' }, { collectionId: 'c1', bookId: 'b' }],
      [row({})],
      [{ collectionId: 'c1', bookId: 'b' }, { collectionId: 'c1', bookId: 'a' }],
    ])
    await saveCollectionContent(client, {
      id: 'c1',
      content: { title: 'Тема', descriptionMarkdown: 'Текст', displayName: 'Аня', bookIds: ['b', 'a'] },
      by: 'author',
      now: new Date('2026-09-13T12:00:00Z'),
    })
    const update = writes.find((w) => w.op === 'update')
    expect(update?.args[0]).not.toHaveProperty('editedAt')
    expect(writes.map((w) => w.op)).toEqual(['update', 'delete', 'insert'])
  })

  it('неизвестная подборка — not_found', async () => {
    const { client } = fakeDb([[]])
    await expect(saveCollectionContent(client, {
      id: 'x', content: { title: 'Т', descriptionMarkdown: '', displayName: '', bookIds: [] }, by: 'author', now: new Date(),
    })).rejects.toBeInstanceOf(CollectionError)
  })
})

describe('applyAdminCollectionAction', () => {
  it('первая публикация выбирает свободный адрес', async () => {
    const { client, writes } = fakeDb([
      [row({ status: 'pending', slug: null, title: 'Тема' })],
      [],
      [{ slug: 'tema' }],
      [row({ status: 'published', slug: 'tema-2' })],
      [],
    ])
    await applyAdminCollectionAction(client, { id: 'c1', action: 'publish', reason: null, now: new Date() })
    expect(writes[0].args[0]).toMatchObject({ status: 'published', slug: 'tema-2' })
  })
})

describe('searchPublishedBooks', () => {
  it('короткий запрос не ищет', async () => {
    const { client } = fakeDb([])
    await expect(searchPublishedBooks(' а ', client)).resolves.toEqual([])
  })
  it('отдаёт год, тип и статус клуба', async () => {
    const { client } = fakeDb([[{ ...book('a'), publishedDate: '01/2019', type: 'article', readingStatus: 'read' }]])
    await expect(searchPublishedBooks('кни', client)).resolves.toEqual([
      { id: 'a', title: 'Книга a', author: 'Автор', coverUrl: null, year: '2019', isArticle: true, clubStatus: 'read' },
    ])
  })
})
```

- [ ] **Step 2: Прогон — падает**

- [ ] **Step 3: Реализация**

```ts
// lib/collections/repo.ts
import { and, asc, eq, ilike, inArray, like, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookCollectionItems, bookCollections, books } from '@/lib/db/schema'
import { fetchBooksByIds, type BookWithCover } from '@/lib/books'
import { slugifyTitle, uniqueSlug } from '@/lib/slug'
import { CollectionError } from './errors'
import { diffCollection, summarizeDiff } from './diff'
import {
  canEditCollection, canViewCollection, collectionSortAt, isChangedSinceReview, normalizeBookIds,
  planAdminAction, planContentSave, planSubmit, snapshotOf, validateCollectionContent,
} from './rules'
import type {
  AdminCollectionAction, AdminCollectionQueue, AdminQueueItem, CollectionBookSearchResult, CollectionCoverBook,
  CollectionListItem, CollectionRecord, CollectionSnapshot, CollectionStatus, CollectionViewer, EditorBook,
  MyCollectionItem, SerializedCollection,
} from './types'

type DbLike = typeof db
type CollectionRow = typeof bookCollections.$inferSelect

const RESERVED_SLUGS = new Set(['new'])
const CARD_COVERS = 5
const PROFILE_COVERS = 8

interface BookInfo {
  id: string
  title: string
  author: string
  coverUrl: string | null
  visibility: string
  readingStatus: string | null
  publishedDate: string
  type: string
}

function toRecord(row: CollectionRow, bookIds: string[]): CollectionRecord {
  return {
    id: row.id,
    slug: row.slug,
    authorUserId: row.authorUserId,
    displayName: row.displayName,
    title: row.title,
    descriptionMarkdown: row.descriptionMarkdown,
    status: row.status as CollectionStatus,
    moderationReason: row.moderationReason,
    submittedAt: row.submittedAt,
    editedAt: row.editedAt,
    publishedAt: row.publishedAt,
    reviewedAt: row.reviewedAt,
    reviewedSnapshot: (row.reviewedSnapshot as CollectionSnapshot | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    bookIds,
  }
}

export function serializeCollection(record: CollectionRecord): SerializedCollection {
  const iso = (date: Date | null) => (date ? date.toISOString() : null)
  return {
    ...record,
    submittedAt: iso(record.submittedAt),
    editedAt: iso(record.editedAt),
    publishedAt: iso(record.publishedAt),
    reviewedAt: iso(record.reviewedAt),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

async function recordsFromRows(client: DbLike, rows: CollectionRow[]): Promise<CollectionRecord[]> {
  const ids = rows.map((row) => row.id)
  const bookIdsByCollection = new Map<string, string[]>(ids.map((id) => [id, []]))
  if (ids.length > 0) {
    const items = await client
      .select({ collectionId: bookCollectionItems.collectionId, bookId: bookCollectionItems.bookId })
      .from(bookCollectionItems)
      .where(inArray(bookCollectionItems.collectionId, ids))
      .orderBy(asc(bookCollectionItems.collectionId), asc(bookCollectionItems.position))
    for (const item of items) bookIdsByCollection.get(item.collectionId)?.push(item.bookId)
  }
  return rows.map((row) => toRecord(row, bookIdsByCollection.get(row.id) ?? []))
}

async function loadBookInfo(client: DbLike, bookIds: readonly string[]): Promise<Map<string, BookInfo>> {
  const unique = Array.from(new Set(bookIds))
  if (unique.length === 0) return new Map()
  const rows = await client
    .select({
      id: books.id, title: books.title, author: books.author, coverUrl: books.coverUrl,
      visibility: books.visibility, readingStatus: books.readingStatus, publishedDate: books.publishedDate, type: books.type,
    })
    .from(books)
    .where(inArray(books.id, unique))
  return new Map(rows.map((row) => [row.id, row]))
}

function publicIds(bookIds: readonly string[], info: ReadonlyMap<string, BookInfo>): string[] {
  return bookIds.filter((id) => info.get(id)?.visibility === 'published')
}

function coversOf(bookIds: readonly string[], info: ReadonlyMap<string, BookInfo>, limit: number): CollectionCoverBook[] {
  return bookIds.slice(0, limit).flatMap((id) => {
    const book = info.get(id)
    return book ? [{ id: book.id, title: book.title, author: book.author, coverUrl: book.coverUrl }] : []
  })
}

function yearOf(publishedDate: string): string {
  return publishedDate.split('/').pop()?.trim() ?? ''
}

function clubStatusOf(value: string | null): 'reading' | 'read' | null {
  return value === 'reading' || value === 'read' ? value : null
}

export async function loadCollectionById(id: string, client: DbLike = db): Promise<CollectionRecord | null> {
  const rows = await client.select().from(bookCollections).where(eq(bookCollections.id, id)).limit(1)
  if (rows.length === 0) return null
  return (await recordsFromRows(client, rows))[0]
}

export async function loadCollectionBySlugOrId(ref: string, client: DbLike = db): Promise<CollectionRecord | null> {
  const bySlug = await client.select().from(bookCollections).where(eq(bookCollections.slug, ref)).limit(1)
  if (bySlug.length > 0) return (await recordsFromRows(client, bySlug))[0]
  return loadCollectionById(ref, client)
}

export async function loadCollectionPageData(
  ref: string,
  viewer: CollectionViewer,
  client: DbLike = db,
): Promise<{ record: CollectionRecord; books: Array<{ book: BookWithCover; hiddenFromCatalog: boolean }> } | null> {
  const record = await loadCollectionBySlugOrId(ref, client)
  if (!record || !canViewCollection(record, viewer)) return null
  const canSeeHidden = canEditCollection(record, viewer)
  const found = await fetchBooksByIds(record.bookIds, client)
  const items = found
    .map((book) => ({ book, hiddenFromCatalog: book.visibility !== 'published' }))
    .filter((item) => canSeeHidden || !item.hiddenFromCatalog)
  return { record, books: items }
}

export async function loadEditorBooks(bookIds: readonly string[], client: DbLike = db): Promise<EditorBook[]> {
  const info = await loadBookInfo(client, bookIds)
  return bookIds.flatMap((id) => {
    const book = info.get(id)
    if (!book) return []
    return [{
      id: book.id, title: book.title, author: book.author, coverUrl: book.coverUrl,
      year: yearOf(book.publishedDate), isArticle: book.type === 'article',
      clubStatus: clubStatusOf(book.readingStatus), hiddenFromCatalog: book.visibility !== 'published',
    }]
  })
}

export async function listPublishedCollections(client: DbLike = db): Promise<CollectionListItem[]> {
  const rows = await client.select().from(bookCollections).where(eq(bookCollections.status, 'published'))
  const records = await recordsFromRows(client, rows)
  const info = await loadBookInfo(client, records.flatMap((record) => record.bookIds))
  return records
    .map((record) => ({ record, visible: publicIds(record.bookIds, info), sortAt: collectionSortAt(record) ?? record.createdAt }))
    .filter(({ record, visible }) => record.slug !== null && visible.length > 0)
    .sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime())
    .map(({ record, visible, sortAt }) => ({
      id: record.id,
      slug: record.slug as string,
      title: record.title,
      textsCount: visible.length,
      covers: coversOf(visible, info, CARD_COVERS),
      sortAt: sortAt.toISOString(),
    }))
}

export async function listMyCollections(userId: string, client: DbLike = db): Promise<MyCollectionItem[]> {
  const rows = await client.select().from(bookCollections).where(eq(bookCollections.authorUserId, userId))
  const records = await recordsFromRows(client, rows)
  const info = await loadBookInfo(client, records.flatMap((record) => record.bookIds))
  return records
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .map((record) => ({
      id: record.id,
      slug: record.slug,
      title: record.title,
      status: record.status,
      moderationReason: record.moderationReason,
      textsCount: record.bookIds.length,
      covers: coversOf(record.bookIds, info, PROFILE_COVERS),
      changedAt: (record.editedAt ?? record.updatedAt).toISOString(),
      submittedAt: record.submittedAt ? record.submittedAt.toISOString() : null,
    }))
}

export async function listAdminQueue(client: DbLike = db): Promise<AdminCollectionQueue> {
  const rows = await client.select().from(bookCollections)
  const records = (await recordsFromRows(client, rows)).filter((record) => record.status !== 'draft')
  const info = await loadBookInfo(client, records.flatMap((record) => record.bookIds))

  const item = (record: CollectionRecord, at: Date): AdminQueueItem => ({
    id: record.id,
    slug: record.slug,
    title: record.title,
    displayName: record.displayName,
    status: record.status,
    textsCount: record.bookIds.length,
    covers: coversOf(record.bookIds, info, PROFILE_COVERS),
    at: at.toISOString(),
    diffSummary: record.reviewedSnapshot && isChangedSinceReview(record)
      ? summarizeDiff(diffCollection(record.reviewedSnapshot, snapshotOf(record)))
      : null,
  })
  const byTime = (pick: (r: CollectionRecord) => Date, direction: 1 | -1) =>
    (a: CollectionRecord, b: CollectionRecord) => direction * (pick(a).getTime() - pick(b).getTime())

  const pending = records.filter((r) => r.status === 'pending')
  const changed = records.filter((r) => isChangedSinceReview(r))
  const published = records.filter((r) => r.status === 'published' && !isChangedSinceReview(r))
  const rejectedOrHidden = records.filter((r) => r.status === 'rejected' || r.status === 'hidden')
  const submitted = (r: CollectionRecord) => r.submittedAt ?? r.updatedAt
  const edited = (r: CollectionRecord) => r.editedAt ?? r.updatedAt
  const sortAt = (r: CollectionRecord) => collectionSortAt(r) ?? r.updatedAt

  return {
    pending: pending.sort(byTime(submitted, 1)).map((r) => item(r, submitted(r))),
    changed: changed.sort(byTime(edited, 1)).map((r) => item(r, edited(r))),
    published: published.sort(byTime(sortAt, -1)).map((r) => item(r, sortAt(r))),
    rejectedOrHidden: rejectedOrHidden.sort(byTime((r) => r.updatedAt, -1)).map((r) => item(r, r.updatedAt)),
  }
}

export async function searchPublishedBooks(query: string, client: DbLike = db): Promise<CollectionBookSearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const pattern = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
  const rows = await client
    .select({
      id: books.id, title: books.title, author: books.author, coverUrl: books.coverUrl,
      publishedDate: books.publishedDate, type: books.type, readingStatus: books.readingStatus,
    })
    .from(books)
    .where(and(eq(books.visibility, 'published'), or(ilike(books.title, pattern), ilike(books.author, pattern))))
    .orderBy(asc(books.title))
    .limit(20)
  return rows.map((row) => ({
    id: row.id, title: row.title, author: row.author, coverUrl: row.coverUrl,
    year: yearOf(row.publishedDate), isArticle: row.type === 'article', clubStatus: clubStatusOf(row.readingStatus),
  }))
}

async function requireCollection(client: DbLike, id: string): Promise<CollectionRecord> {
  const record = await loadCollectionById(id, client)
  if (!record) throw new CollectionError('not_found')
  return record
}

export async function createDraftCollection(
  tx: DbLike,
  input: { authorUserId: string; title: string; now: Date },
): Promise<CollectionRecord> {
  const content = { title: input.title, descriptionMarkdown: '', displayName: '', bookIds: [] }
  const issues = validateCollectionContent(content, 'save')
  if (issues.length > 0) throw new CollectionError('validation', { issues })
  const [row] = await tx
    .insert(bookCollections)
    .values({ authorUserId: input.authorUserId, title: input.title.trim(), createdAt: input.now, updatedAt: input.now })
    .returning()
  return toRecord(row, [])
}

export async function saveCollectionContent(
  tx: DbLike,
  input: { id: string; content: CollectionSnapshot; by: 'author' | 'admin'; now: Date },
): Promise<CollectionRecord> {
  const current = await requireCollection(tx, input.id)
  const issues = validateCollectionContent(input.content, 'save')
  if (issues.length > 0) throw new CollectionError('validation', { issues })

  const bookIds = normalizeBookIds(input.content.bookIds)
  const added = bookIds.filter((id) => !current.bookIds.includes(id))
  if (added.length > 0) {
    const published = await tx
      .select({ id: books.id })
      .from(books)
      .where(and(inArray(books.id, added), eq(books.visibility, 'published')))
    if (published.length !== added.length) {
      const ok = new Set(published.map((row) => row.id))
      throw new CollectionError('book_not_published', { bookIds: added.filter((id) => !ok.has(id)) })
    }
  }

  const { patch } = planContentSave(current, { ...input.content, bookIds }, input.by, input.now)
  await tx.update(bookCollections).set(patch).where(eq(bookCollections.id, input.id))
  if (bookIds.join('\n') !== current.bookIds.join('\n')) {
    await tx.delete(bookCollectionItems).where(eq(bookCollectionItems.collectionId, input.id))
    if (bookIds.length > 0) {
      await tx.insert(bookCollectionItems).values(
        bookIds.map((bookId, index) => ({ collectionId: input.id, bookId, position: index + 1 })),
      )
    }
  }
  return requireCollection(tx, input.id)
}

export async function submitCollection(tx: DbLike, input: { id: string; now: Date }): Promise<CollectionRecord> {
  const current = await requireCollection(tx, input.id)
  const info = await loadBookInfo(tx, current.bookIds)
  const patch = planSubmit(current, input.now, new Set(publicIds(current.bookIds, info)))
  await tx.update(bookCollections).set(patch).where(eq(bookCollections.id, input.id))
  return requireCollection(tx, input.id)
}

async function allocateSlug(tx: DbLike, title: string): Promise<string> {
  const base = slugifyTitle(title, 'podborka')
  const rows = await tx.select({ slug: bookCollections.slug }).from(bookCollections).where(like(bookCollections.slug, `${base}%`))
  const taken = new Set(rows.flatMap((row) => (row.slug ? [row.slug] : [])))
  return uniqueSlug(base, taken, RESERVED_SLUGS)
}

export async function applyAdminCollectionAction(
  tx: DbLike,
  input: { id: string; action: AdminCollectionAction; reason: string | null; now: Date },
): Promise<CollectionRecord> {
  const current = await requireCollection(tx, input.id)
  const needsSlug = (input.action === 'publish' || input.action === 'unhide') && !current.slug
  const slug = needsSlug ? await allocateSlug(tx, current.title) : null
  const patch = planAdminAction(current, input.action, { reason: input.reason, now: input.now, slug })
  await tx.update(bookCollections).set(patch).where(eq(bookCollections.id, input.id))
  return requireCollection(tx, input.id)
}

export async function deleteCollection(tx: DbLike, id: string): Promise<void> {
  await tx.delete(bookCollections).where(eq(bookCollections.id, id))
}
```

> Если `ilike` / `like` не экспортируются установленной версией `drizzle-orm` — проверь `node -p "Object.keys(require('drizzle-orm')).filter(k=>/like/i.test(k))"`; в 0.3x оба есть.

- [ ] **Step 4: Прогон** `npx jest lib/collections` → PASS. Если тест `applyAdminCollectionAction` не совпал по порядку `select` — порядок вызовов: `loadCollectionById` (строка) → `recordsFromRows` (состав) → `allocateSlug` → `requireCollection` (строка) → состав. Подгоняй очередь результатов теста, не реализацию.

- [ ] **Step 5: Коммит**

```bash
git add lib/collections/repo.ts lib/collections/repo.test.ts
git commit -m "feat(collections): слой чтения и записи подборок"
```

---

### Task 8: Запись на одну книгу

**Files:**
- Create: `lib/signup-selection.ts`, `app/api/signup-books/[bookId]/route.ts`, `app/api/signup-books/[bookId]/route.test.ts`
- Modify: `app/api/signup/route.ts`

**Interfaces:**
- Produces: `saveSignupSelection(session: AuthSession, input: { name: string; contacts: string; selectedBookIds: string[] }): Promise<NextResponse>`, `type AuthSession`; роуты `POST` / `DELETE /api/signup-books/[bookId]`

- [ ] **Step 1: Вынести логику без изменения поведения**

`lib/signup-selection.ts` — перенести **весь** код `POST` из `app/api/signup/route.ts`, начиная со строки `const activeSessionId = await getActiveMatchingSessionIdForParticipant(pgUserId)` и до `return NextResponse.json({ ok: true })` включительно, в функцию:

```ts
// lib/signup-selection.ts
import { NextResponse } from 'next/server'
import type { auth } from '@/lib/auth'
// ...те же импорты, что сейчас в app/api/signup/route.ts, кроме `auth` и `NextRequest`

export type AuthSession = NonNullable<Awaited<ReturnType<typeof auth>>> & { user: { id: string } }

export interface SignupSelectionInput {
  name: string
  contacts: string
  selectedBookIds: string[]
}

/** Общая запись списка книг: учитывает активную сессию матчинга и инвариант рангов. */
export async function saveSignupSelection(session: AuthSession, input: SignupSelectionInput): Promise<NextResponse> {
  const pgUserId = session.user.id
  const { name, contacts, selectedBookIds } = input
  // ↓ перенесённый код без изменений
}
```

`app/api/signup/route.ts` становится:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { saveSignupSelection, type AuthSession } from '@/lib/signup-selection'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()
  const { name, contacts, selectedBookIds } = body
  if (!name?.trim() || typeof contacts !== 'string' || !Array.isArray(selectedBookIds)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  return saveSignupSelection(session as AuthSession, { name, contacts, selectedBookIds })
}
```

Прогон: `npx jest app/api/signup` → существующие тесты PASS без правок (моки те же модули). Если тест мокает модули по относительному пути от роута — поправь только пути в `jest.mock`, не ассерты.

- [ ] **Step 2: Тест нового роута**

```ts
// app/api/signup-books/[bookId]/route.test.ts
/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from 'next/server'
import { DELETE, POST } from './route'
import { auth } from '@/lib/auth'
import { saveSignupSelection } from '@/lib/signup-selection'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/signup-selection', () => ({ saveSignupSelection: jest.fn() }))

const selectQueue: unknown[][] = []
jest.mock('@/lib/db', () => {
  const chain = (): unknown => new Proxy({}, {
    get: (_t, prop) => (prop === 'then'
      ? (resolve: (v: unknown) => void) => resolve(selectQueue.shift() ?? [])
      : () => chain()),
  })
  return { db: { select: () => chain() } }
})

const mockAuth = auth as jest.Mock
const mockSave = saveSignupSelection as jest.Mock
const req = (method: string) => new NextRequest('http://localhost/api/signup-books/b2', { method })
const params = { params: { bookId: 'b2' } }

beforeEach(() => {
  selectQueue.length = 0
  mockSave.mockResolvedValue(NextResponse.json({ ok: true }))
  mockAuth.mockResolvedValue({ user: { id: 'u1', name: 'Аня' } })
})

describe('POST /api/signup-books/[bookId]', () => {
  it('401 без входа', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await POST(req('POST'), params)).status).toBe(401)
  })

  it('404 для неопубликованной книги', async () => {
    selectQueue.push([{ id: 'b2', visibility: 'hidden' }])
    expect((await POST(req('POST'), params)).status).toBe(404)
  })

  it('409 contacts_required, если у пользователя нет контактов', async () => {
    selectQueue.push([{ id: 'b2', visibility: 'published' }], [{ name: 'Аня', contacts: '' }])
    const res = await POST(req('POST'), params)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'contacts_required' })
  })

  it('добавляет книгу к текущему списку', async () => {
    selectQueue.push([{ id: 'b2', visibility: 'published' }], [{ name: 'Аня', contacts: '@anya' }], [{ bookId: 'b1' }])
    await POST(req('POST'), params)
    expect(mockSave).toHaveBeenCalledWith(expect.anything(), { name: 'Аня', contacts: '@anya', selectedBookIds: ['b1', 'b2'] })
  })

  it('уже в списке — ничего не пишет', async () => {
    selectQueue.push([{ id: 'b2', visibility: 'published' }], [{ name: 'Аня', contacts: '@anya' }], [{ bookId: 'b2' }])
    const res = await POST(req('POST'), params)
    expect(await res.json()).toEqual({ ok: true, alreadySelected: true })
    expect(mockSave).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/signup-books/[bookId]', () => {
  it('убирает книгу из текущего списка', async () => {
    selectQueue.push([{ name: 'Аня', contacts: '@anya' }], [{ bookId: 'b1' }, { bookId: 'b2' }])
    await DELETE(req('DELETE'), params)
    expect(mockSave).toHaveBeenCalledWith(expect.anything(), { name: 'Аня', contacts: '@anya', selectedBookIds: ['b1'] })
  })
})
```

- [ ] **Step 3: Прогон — падает**

- [ ] **Step 4: Реализация**

```ts
// app/api/signup-books/[bookId]/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { books, signupBooks, users } from '@/lib/db/schema'
import { saveSignupSelection, type AuthSession } from '@/lib/signup-selection'

type Params = { params: { bookId: string } }

async function loadProfile(userId: string) {
  const [user] = await db.select({ name: users.name, contacts: users.contacts }).from(users).where(eq(users.id, userId)).limit(1)
  const name = user?.name?.trim() ?? ''
  const contacts = user?.contacts?.trim() ?? ''
  return name && contacts ? { name, contacts } : null
}

async function currentBookIds(userId: string): Promise<string[]> {
  const rows = await db.select({ bookId: signupBooks.bookId }).from(signupBooks).where(eq(signupBooks.userId, userId))
  return rows.map((row) => row.bookId)
}

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [book] = await db.select({ id: books.id, visibility: books.visibility }).from(books).where(eq(books.id, params.bookId)).limit(1)
  if (!book || book.visibility !== 'published') return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const profile = await loadProfile(session.user.id)
  if (!profile) return NextResponse.json({ error: 'contacts_required' }, { status: 409 })

  const selected = await currentBookIds(session.user.id)
  if (selected.includes(params.bookId)) return NextResponse.json({ ok: true, alreadySelected: true })

  return saveSignupSelection(session as AuthSession, { ...profile, selectedBookIds: [...selected, params.bookId] })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await loadProfile(session.user.id)
  if (!profile) return NextResponse.json({ error: 'contacts_required' }, { status: 409 })

  const selected = await currentBookIds(session.user.id)
  if (!selected.includes(params.bookId)) return NextResponse.json({ ok: true, alreadyRemoved: true })

  return saveSignupSelection(session as AuthSession, { ...profile, selectedBookIds: selected.filter((id) => id !== params.bookId) })
}
```

> В тесте DELETE очередь `select` начинается с профиля — в реализации DELETE книгу не читает, порядок совпадает.

- [ ] **Step 5: Прогон** `npx jest app/api/signup app/api/signup-books` → PASS

- [ ] **Step 6: Коммит**

```bash
git add lib/signup-selection.ts app/api/signup/route.ts "app/api/signup-books/[bookId]"
git commit -m "feat(collections): запись и снятие одной книги без перезаписи списка"
```

---

### Task 9: HTTP-помощники и публичные роуты

**Files:**
- Create: `lib/collections/http.ts`, `lib/collections/http.test.ts`
- Create: `app/api/collections/route.ts`, `app/api/collections/[slugOrId]/route.ts`, `app/api/collections/book-search/route.ts`, `app/api/collections/routes.test.ts`

**Interfaces:**
- Produces: `collectionErrorResponse(error): NextResponse`, `collectionAuditContext(session, source)`, `viewerFromSession(session)`, `readContentBody(req): Promise<CollectionSnapshot>`

- [ ] **Step 1: Тесты**

```ts
// lib/collections/http.test.ts
/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { collectionErrorResponse, readContentBody, viewerFromSession } from './http'
import { CollectionError } from './errors'

describe('collectionErrorResponse', () => {
  it.each([
    ['not_found', 404], ['forbidden', 403], ['invalid_transition', 409],
    ['validation', 400], ['book_not_published', 400], ['migration_required', 409],
  ] as const)('%s → %i', async (code, status) => {
    const res = collectionErrorResponse(new CollectionError(code, { issues: ['x'] }))
    expect(res.status).toBe(status)
    expect(await res.json()).toMatchObject({ error: code, issues: ['x'] })
  })
  it('нет таблицы → 409 migration_required', async () => {
    const res = collectionErrorResponse(Object.assign(new Error('relation does not exist'), { code: '42P01' }))
    expect(res.status).toBe(409)
  })
  it('прочее → 500', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(collectionErrorResponse(new Error('boom')).status).toBe(500)
  })
})

describe('readContentBody', () => {
  const req = (body: unknown) => new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify(body) })
  it('приводит поля к строкам и массиву строк', async () => {
    await expect(readContentBody(req({ title: 'T', descriptionMarkdown: 'D', displayName: 'N', bookIds: ['a', 1] })))
      .resolves.toEqual({ title: 'T', descriptionMarkdown: 'D', displayName: 'N', bookIds: ['a'] })
  })
  it('битое тело — validation', async () => {
    await expect(readContentBody(new NextRequest('http://x', { method: 'PATCH', body: '{' }))).rejects.toMatchObject({ code: 'validation' })
  })
})

describe('viewerFromSession', () => {
  it('гость и админ', () => {
    expect(viewerFromSession(null)).toEqual({ userId: null, isAdmin: false })
    expect(viewerFromSession({ user: { id: 'a', isAdmin: true } } as never)).toEqual({ userId: 'a', isAdmin: true })
  })
})
```

```ts
// app/api/collections/routes.test.ts
/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET as listGET } from './route'
import { GET as oneGET } from './[slugOrId]/route'
import { GET as searchGET } from './book-search/route'
import { auth } from '@/lib/auth'
import * as repo from '@/lib/collections/repo'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/collections/repo', () => ({
  listPublishedCollections: jest.fn(),
  loadCollectionPageData: jest.fn(),
  searchPublishedBooks: jest.fn(),
  serializeCollection: jest.fn((record) => ({ ...record, serialized: true })),
}))

const mockAuth = auth as jest.Mock

describe('GET /api/collections', () => {
  it('отдаёт опубликованные', async () => {
    (repo.listPublishedCollections as jest.Mock).mockResolvedValue([{ id: 'c1' }])
    expect(await (await listGET()).json()).toEqual({ collections: [{ id: 'c1' }] })
  })
  it('без миграции — пустой список', async () => {
    (repo.listPublishedCollections as jest.Mock).mockRejectedValue(Object.assign(new Error('x'), { code: '42P01' }))
    expect(await (await listGET()).json()).toEqual({ collections: [] })
  })
})

describe('GET /api/collections/[slugOrId]', () => {
  it('404, если подборка недоступна смотрящему', async () => {
    mockAuth.mockResolvedValue(null)
    ;(repo.loadCollectionPageData as jest.Mock).mockResolvedValue(null)
    const res = await oneGET(new NextRequest('http://x'), { params: { slugOrId: 'tema' } })
    expect(res.status).toBe(404)
  })
  it('передаёт смотрящего в репозиторий', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', isAdmin: false } })
    ;(repo.loadCollectionPageData as jest.Mock).mockResolvedValue({ record: { id: 'c1' }, books: [] })
    const res = await oneGET(new NextRequest('http://x'), { params: { slugOrId: 'tema' } })
    expect(repo.loadCollectionPageData).toHaveBeenCalledWith('tema', { userId: 'u1', isAdmin: false })
    expect(await res.json()).toEqual({ collection: { id: 'c1', serialized: true }, books: [] })
  })
})

describe('GET /api/collections/book-search', () => {
  it('401 без входа', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await searchGET(new NextRequest('http://x/api/collections/book-search?q=ha'))).status).toBe(401)
  })
  it('ищет по q', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    ;(repo.searchPublishedBooks as jest.Mock).mockResolvedValue([{ id: 'b' }])
    const res = await searchGET(new NextRequest('http://x/api/collections/book-search?q=harv'))
    expect(repo.searchPublishedBooks).toHaveBeenCalledWith('harv')
    expect(await res.json()).toEqual({ books: [{ id: 'b' }] })
  })
})
```

- [ ] **Step 2: Прогон — падает**

- [ ] **Step 3: Реализация**

```ts
// lib/collections/http.ts
import { NextResponse, type NextRequest } from 'next/server'
import type { AuthSession } from '@/lib/signup-selection'
import { CollectionError, isMissingCollectionsSchemaError, type CollectionErrorCode } from './errors'
import type { CollectionSnapshot, CollectionViewer } from './types'

const STATUS_BY_CODE: Record<CollectionErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  invalid_transition: 409,
  validation: 400,
  book_not_published: 400,
  migration_required: 409,
}

export function collectionErrorResponse(error: unknown): NextResponse {
  if (error instanceof CollectionError) {
    return NextResponse.json({ error: error.code, ...error.details }, { status: STATUS_BY_CODE[error.code] })
  }
  if (isMissingCollectionsSchemaError(error)) {
    return NextResponse.json({ error: 'migration_required' }, { status: 409 })
  }
  console.error('collections route failed', error)
  return NextResponse.json({ error: 'collections_failed' }, { status: 500 })
}

export function collectionAuditContext(session: AuthSession, source: 'collections' | 'admin') {
  return {
    actorUserId: session.user.id,
    actorLabel: session.user.name ?? session.user.contactEmail ?? null,
    source,
  }
}

type MaybeSession = { user?: { id?: string | null; isAdmin?: boolean | null } | null } | null | undefined

export function viewerFromSession(session: MaybeSession): CollectionViewer {
  return { userId: session?.user?.id ?? null, isAdmin: Boolean(session?.user?.isAdmin) }
}

export async function readContentBody(req: NextRequest): Promise<CollectionSnapshot> {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') throw new CollectionError('validation', { issues: ['invalid_body'] })
  const str = (value: unknown) => (typeof value === 'string' ? value : '')
  return {
    title: str(body.title),
    descriptionMarkdown: str(body.descriptionMarkdown),
    displayName: str(body.displayName),
    bookIds: Array.isArray(body.bookIds) ? body.bookIds.filter((id): id is string => typeof id === 'string') : [],
  }
}
```

```ts
// app/api/collections/route.ts
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { listPublishedCollections } from '@/lib/collections/repo'
import { isMissingCollectionsSchemaError } from '@/lib/collections/errors'
import { collectionErrorResponse } from '@/lib/collections/http'

export async function GET() {
  try {
    return NextResponse.json({ collections: await listPublishedCollections() })
  } catch (error) {
    if (isMissingCollectionsSchemaError(error)) return NextResponse.json({ collections: [] })
    return collectionErrorResponse(error)
  }
}
```

```ts
// app/api/collections/[slugOrId]/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { loadCollectionPageData, serializeCollection } from '@/lib/collections/repo'
import { collectionErrorResponse, viewerFromSession } from '@/lib/collections/http'

export async function GET(_req: NextRequest, { params }: { params: { slugOrId: string } }) {
  try {
    const session = await auth()
    const data = await loadCollectionPageData(params.slugOrId, viewerFromSession(session))
    if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ collection: serializeCollection(data.record), books: data.books })
  } catch (error) {
    return collectionErrorResponse(error)
  }
}
```

```ts
// app/api/collections/book-search/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { searchPublishedBooks } from '@/lib/collections/repo'
import { collectionErrorResponse } from '@/lib/collections/http'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const q = new URL(req.url).searchParams.get('q') ?? ''
    return NextResponse.json({ books: await searchPublishedBooks(q) })
  } catch (error) {
    return collectionErrorResponse(error)
  }
}
```

> `book-search` — статический сегмент рядом с `[slugOrId]`: Next.js выбирает статический первым. Адрес подборки `book-search` невозможен: транслитерация не даёт такой строки из осмысленного названия, но для надёжности добавь `'book-search'` в `RESERVED_SLUGS` в `repo.ts`.

- [ ] **Step 4: Прогон** → PASS

- [ ] **Step 5: Коммит**

```bash
git add lib/collections/http.ts lib/collections/http.test.ts lib/collections/repo.ts app/api/collections
git commit -m "feat(collections): публичное API подборок и поиск книг"
```

---

### Task 10: API автора

**Files:**
- Create: `app/api/me/collections/route.ts`, `app/api/me/collections/[id]/route.ts`, `app/api/me/collections/[id]/submit/route.ts`, `app/api/me/collections/routes.test.ts`

- [ ] **Step 1: Тест**

```ts
// app/api/me/collections/routes.test.ts
/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET, POST } from './route'
import { DELETE, PATCH } from './[id]/route'
import { POST as SUBMIT } from './[id]/submit/route'
import { auth } from '@/lib/auth'
import * as repo from '@/lib/collections/repo'
import { CollectionError } from '@/lib/collections/errors'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({}),
}))
jest.mock('@/lib/collections/repo', () => ({
  listMyCollections: jest.fn(),
  createDraftCollection: jest.fn(),
  loadCollectionById: jest.fn(),
  saveCollectionContent: jest.fn(),
  submitCollection: jest.fn(),
  deleteCollection: jest.fn(),
  serializeCollection: jest.fn((record) => record),
}))

const mockAuth = auth as jest.Mock
const json = (body: unknown, method = 'POST') => new NextRequest('http://x', { method, body: JSON.stringify(body) })
const params = { params: { id: 'c1' } }
const content = { title: 'Т', descriptionMarkdown: 'О', displayName: 'П', bookIds: ['a', 'b'] }

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: 'author', name: 'Аня', isAdmin: false } })
})

it('все роуты требуют вход', async () => {
  mockAuth.mockResolvedValue(null)
  expect((await GET()).status).toBe(401)
  expect((await POST(json({ title: 'Т' }))).status).toBe(401)
  expect((await PATCH(json(content, 'PATCH'), params)).status).toBe(401)
  expect((await DELETE(new NextRequest('http://x', { method: 'DELETE' }), params)).status).toBe(401)
  expect((await SUBMIT(new NextRequest('http://x', { method: 'POST' }), params)).status).toBe(401)
})

it('POST создаёт черновик', async () => {
  (repo.createDraftCollection as jest.Mock).mockResolvedValue({ id: 'c1' })
  const res = await POST(json({ title: 'Тема' }))
  expect(res.status).toBe(201)
  expect(repo.createDraftCollection).toHaveBeenCalledWith({}, expect.objectContaining({ authorUserId: 'author', title: 'Тема' }))
})

it('PATCH чужой подборки — 404', async () => {
  (repo.loadCollectionById as jest.Mock).mockResolvedValue({ id: 'c1', authorUserId: 'other', status: 'draft' })
  expect((await PATCH(json(content, 'PATCH'), params)).status).toBe(404)
})

it('PATCH своей — сохраняет от имени автора', async () => {
  (repo.loadCollectionById as jest.Mock).mockResolvedValue({ id: 'c1', authorUserId: 'author', status: 'published' })
  ;(repo.saveCollectionContent as jest.Mock).mockResolvedValue({ id: 'c1' })
  const res = await PATCH(json(content, 'PATCH'), params)
  expect(res.status).toBe(200)
  expect(repo.saveCollectionContent).toHaveBeenCalledWith({}, expect.objectContaining({ id: 'c1', content, by: 'author' }))
})

it('PATCH с неопубликованной книгой — 400 book_not_published', async () => {
  (repo.loadCollectionById as jest.Mock).mockResolvedValue({ id: 'c1', authorUserId: 'author', status: 'draft' })
  ;(repo.saveCollectionContent as jest.Mock).mockRejectedValue(new CollectionError('book_not_published', { bookIds: ['x'] }))
  const res = await PATCH(json(content, 'PATCH'), params)
  expect(res.status).toBe(400)
})

it('DELETE опубликованной автором — 403', async () => {
  (repo.loadCollectionById as jest.Mock).mockResolvedValue({ id: 'c1', authorUserId: 'author', status: 'published' })
  const res = await DELETE(new NextRequest('http://x', { method: 'DELETE' }), params)
  expect(res.status).toBe(403)
  expect(repo.deleteCollection).not.toHaveBeenCalled()
})

it('DELETE скрытой автором — удаляет', async () => {
  (repo.loadCollectionById as jest.Mock).mockResolvedValue({ id: 'c1', authorUserId: 'author', status: 'hidden' })
  expect((await DELETE(new NextRequest('http://x', { method: 'DELETE' }), params)).status).toBe(200)
  expect(repo.deleteCollection).toHaveBeenCalledWith({}, 'c1')
})

it('SUBMIT пробрасывает перечень проблем', async () => {
  (repo.loadCollectionById as jest.Mock).mockResolvedValue({ id: 'c1', authorUserId: 'author', status: 'draft' })
  ;(repo.submitCollection as jest.Mock).mockRejectedValue(new CollectionError('validation', { issues: ['too_few_books'] }))
  const res = await SUBMIT(new NextRequest('http://x', { method: 'POST' }), params)
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'validation', issues: ['too_few_books'] })
})
```

- [ ] **Step 2: Прогон — падает**

- [ ] **Step 3: Реализация**

```ts
// app/api/me/collections/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { createDraftCollection, listMyCollections, serializeCollection } from '@/lib/collections/repo'
import { isMissingCollectionsSchemaError } from '@/lib/collections/errors'
import { collectionAuditContext, collectionErrorResponse } from '@/lib/collections/http'
import type { AuthSession } from '@/lib/signup-selection'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ collections: await listMyCollections(session.user.id) })
  } catch (error) {
    if (isMissingCollectionsSchemaError(error)) return NextResponse.json({ collections: [] })
    return collectionErrorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const authorUserId = session.user.id
  const body = await req.json().catch(() => ({})) as { title?: unknown }
  try {
    const record = await withAuditContext(
      collectionAuditContext(session as AuthSession, 'collections'),
      (tx) => createDraftCollection(tx, { authorUserId, title: typeof body.title === 'string' ? body.title : '', now: new Date() }),
    )
    return NextResponse.json({ collection: serializeCollection(record) }, { status: 201 })
  } catch (error) {
    return collectionErrorResponse(error)
  }
}
```

```ts
// app/api/me/collections/[id]/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { deleteCollection, loadCollectionById, saveCollectionContent, serializeCollection } from '@/lib/collections/repo'
import { canDeleteCollection, isCollectionOwner } from '@/lib/collections/rules'
import { collectionAuditContext, collectionErrorResponse, readContentBody, viewerFromSession } from '@/lib/collections/http'
import type { AuthSession } from '@/lib/signup-selection'

type Params = { params: { id: string } }

async function ownCollection(id: string, session: AuthSession) {
  const record = await loadCollectionById(id)
  // Чужую подборку не показываем даже фактом существования.
  if (!record || !isCollectionOwner(record, viewerFromSession(session))) return null
  return record
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const record = await ownCollection(params.id, session as AuthSession)
    if (!record) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const content = await readContentBody(req)
    const saved = await withAuditContext(
      collectionAuditContext(session as AuthSession, 'collections'),
      (tx) => saveCollectionContent(tx, { id: params.id, content, by: 'author', now: new Date() }),
    )
    return NextResponse.json({ collection: serializeCollection(saved) })
  } catch (error) {
    return collectionErrorResponse(error)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const record = await ownCollection(params.id, session as AuthSession)
    if (!record) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (!canDeleteCollection(record, viewerFromSession(session))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    await withAuditContext(collectionAuditContext(session as AuthSession, 'collections'), (tx) => deleteCollection(tx, params.id))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return collectionErrorResponse(error)
  }
}
```

```ts
// app/api/me/collections/[id]/submit/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { loadCollectionById, serializeCollection, submitCollection } from '@/lib/collections/repo'
import { isCollectionOwner } from '@/lib/collections/rules'
import { collectionAuditContext, collectionErrorResponse, viewerFromSession } from '@/lib/collections/http'
import type { AuthSession } from '@/lib/signup-selection'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const record = await loadCollectionById(params.id)
    if (!record || !isCollectionOwner(record, viewerFromSession(session))) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    const submitted = await withAuditContext(
      collectionAuditContext(session as AuthSession, 'collections'),
      (tx) => submitCollection(tx, { id: params.id, now: new Date() }),
    )
    return NextResponse.json({ collection: serializeCollection(submitted) })
  } catch (error) {
    return collectionErrorResponse(error)
  }
}
```

> Если `withAuditContext` типизирует `tx` иначе, чем `typeof db`, приведи в вызове: `(tx) => createDraftCollection(tx as never, …)` — так же, как делают другие роуты проекта при несовпадении (`tx as unknown as typeof db` в `lib/signup-books.ts`).

- [ ] **Step 4: Прогон** → PASS

- [ ] **Step 5: Коммит**

```bash
git add app/api/me/collections
git commit -m "feat(collections): API автора — черновик, сохранение, отправка, удаление"
```

---

### Task 11: API модерации и настройки

**Files:**
- Create: `app/api/admin/collections/route.ts`, `app/api/admin/collections/[id]/route.ts`, `app/api/admin/collections/[id]/actions/route.ts`, `app/api/admin/collections/settings/route.ts`, `app/api/admin/collections/routes.test.ts`

- [ ] **Step 1: Тест**

```ts
// app/api/admin/collections/routes.test.ts
/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET as queueGET } from './route'
import { DELETE, GET as oneGET, PATCH } from './[id]/route'
import { POST as ACTION } from './[id]/actions/route'
import { GET as settingsGET, PATCH as settingsPATCH } from './settings/route'
import { auth } from '@/lib/auth'
import * as repo from '@/lib/collections/repo'
import * as settings from '@/lib/site-settings'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({}),
}))
jest.mock('@/lib/collections/repo', () => ({
  listAdminQueue: jest.fn(),
  loadCollectionById: jest.fn(),
  loadEditorBooks: jest.fn(),
  saveCollectionContent: jest.fn(),
  deleteCollection: jest.fn(),
  applyAdminCollectionAction: jest.fn(),
  serializeCollection: jest.fn((record) => record),
}))
jest.mock('@/lib/site-settings', () => ({ getSiteSetting: jest.fn(), setSiteSetting: jest.fn() }))

const mockAuth = auth as jest.Mock
const req = (body?: unknown, method = 'POST') => new NextRequest('http://x', { method, body: body === undefined ? undefined : JSON.stringify(body) })
const params = { params: { id: 'c1' } }
const admin = { user: { id: 'admin', name: 'Owner', isAdmin: true } }

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue(admin)
})

it('все роуты закрыты для не-админа', async () => {
  mockAuth.mockResolvedValue({ user: { id: 'u', isAdmin: false } })
  expect((await queueGET()).status).toBe(403)
  expect((await oneGET(req(undefined, 'GET'), params)).status).toBe(403)
  expect((await PATCH(req({}, 'PATCH'), params)).status).toBe(403)
  expect((await DELETE(req(undefined, 'DELETE'), params)).status).toBe(403)
  expect((await ACTION(req({ action: 'publish' }), params)).status).toBe(403)
  expect((await settingsGET()).status).toBe(403)
  expect((await settingsPATCH(req({ homeBlockEnabled: true }, 'PATCH'))).status).toBe(403)
})

it('GET подборки отдаёт разницу со снимком', async () => {
  (repo.loadCollectionById as jest.Mock).mockResolvedValue({
    id: 'c1', status: 'published', title: 'Т', descriptionMarkdown: 'О', displayName: 'П', bookIds: ['a', 'b'],
    reviewedSnapshot: { title: 'Т', descriptionMarkdown: 'О', displayName: 'П', bookIds: ['a'] },
  })
  ;(repo.loadEditorBooks as jest.Mock).mockResolvedValue([])
  const body = await (await oneGET(req(undefined, 'GET'), params)).json()
  expect(body.diff.added).toEqual(['b'])
})

it('ACTION: неизвестное действие — 400', async () => {
  expect((await ACTION(req({ action: 'explode' }), params)).status).toBe(400)
})

it('ACTION: reject передаёт причину', async () => {
  (repo.applyAdminCollectionAction as jest.Mock).mockResolvedValue({ id: 'c1' })
  await ACTION(req({ action: 'reject', reason: 'Мало текста' }), params)
  expect(repo.applyAdminCollectionAction).toHaveBeenCalledWith({}, expect.objectContaining({ id: 'c1', action: 'reject', reason: 'Мало текста' }))
})

it('PATCH сохраняет от имени админа', async () => {
  (repo.saveCollectionContent as jest.Mock).mockResolvedValue({ id: 'c1' })
  await PATCH(req({ title: 'Т', descriptionMarkdown: '', displayName: '', bookIds: [] }, 'PATCH'), params)
  expect(repo.saveCollectionContent).toHaveBeenCalledWith({}, expect.objectContaining({ by: 'admin' }))
})

it('настройка: чтение и запись', async () => {
  (settings.getSiteSetting as jest.Mock).mockResolvedValue(false)
  expect(await (await settingsGET()).json()).toEqual({ homeBlockEnabled: false })
  const res = await settingsPATCH(req({ homeBlockEnabled: true }, 'PATCH'))
  expect(settings.setSiteSetting).toHaveBeenCalledWith({}, 'collections_home_block_enabled', true)
  expect(await res.json()).toEqual({ homeBlockEnabled: true })
})

it('настройка: не булево — 400', async () => {
  expect((await settingsPATCH(req({ homeBlockEnabled: 'yes' }, 'PATCH'))).status).toBe(400)
})
```

- [ ] **Step 2: Прогон — падает**

- [ ] **Step 3: Реализация**

Общий помощник проверки админа — в `lib/collections/http.ts` (дописать):

```ts
export async function requireAdminSession(
  getSession: () => Promise<unknown>,
): Promise<{ session: AuthSession; forbidden: null } | { session: null; forbidden: NextResponse }> {
  const session = await getSession() as AuthSession | null
  if (!session?.user?.isAdmin || !session.user.id) {
    return { session: null, forbidden: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { session, forbidden: null }
}
```

```ts
// app/api/admin/collections/route.ts
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listAdminQueue } from '@/lib/collections/repo'
import { collectionErrorResponse, requireAdminSession } from '@/lib/collections/http'

export async function GET() {
  const { forbidden } = await requireAdminSession(auth)
  if (forbidden) return forbidden
  try {
    return NextResponse.json({ queue: await listAdminQueue() })
  } catch (error) {
    return collectionErrorResponse(error)
  }
}
```

```ts
// app/api/admin/collections/[id]/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { deleteCollection, loadCollectionById, loadEditorBooks, saveCollectionContent, serializeCollection } from '@/lib/collections/repo'
import { diffCollection } from '@/lib/collections/diff'
import { snapshotOf } from '@/lib/collections/rules'
import { collectionAuditContext, collectionErrorResponse, readContentBody, requireAdminSession } from '@/lib/collections/http'

type Params = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const { forbidden } = await requireAdminSession(auth)
  if (forbidden) return forbidden
  try {
    const record = await loadCollectionById(params.id)
    if (!record) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const books = await loadEditorBooks(Array.from(new Set([...record.bookIds, ...(record.reviewedSnapshot?.bookIds ?? [])])))
    const diff = record.reviewedSnapshot ? diffCollection(record.reviewedSnapshot, snapshotOf(record)) : null
    return NextResponse.json({ collection: serializeCollection(record), books, diff })
  } catch (error) {
    return collectionErrorResponse(error)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { session, forbidden } = await requireAdminSession(auth)
  if (forbidden) return forbidden
  try {
    const content = await readContentBody(req)
    const saved = await withAuditContext(collectionAuditContext(session, 'admin'), (tx) =>
      saveCollectionContent(tx, { id: params.id, content, by: 'admin', now: new Date() }))
    return NextResponse.json({ collection: serializeCollection(saved) })
  } catch (error) {
    return collectionErrorResponse(error)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { session, forbidden } = await requireAdminSession(auth)
  if (forbidden) return forbidden
  try {
    await withAuditContext(collectionAuditContext(session, 'admin'), (tx) => deleteCollection(tx, params.id))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return collectionErrorResponse(error)
  }
}
```

> `books` в ответе включает книги снимка — чтобы экран разницы показал названия убранных книг.

```ts
// app/api/admin/collections/[id]/actions/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { applyAdminCollectionAction, serializeCollection } from '@/lib/collections/repo'
import { ADMIN_COLLECTION_ACTIONS, type AdminCollectionAction } from '@/lib/collections/types'
import { collectionAuditContext, collectionErrorResponse, requireAdminSession } from '@/lib/collections/http'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, forbidden } = await requireAdminSession(auth)
  if (forbidden) return forbidden
  const body = await req.json().catch(() => ({})) as { action?: unknown; reason?: unknown }
  if (!ADMIN_COLLECTION_ACTIONS.includes(body.action as AdminCollectionAction)) {
    return NextResponse.json({ error: 'validation', issues: ['invalid_action'] }, { status: 400 })
  }
  try {
    const record = await withAuditContext(collectionAuditContext(session, 'admin'), (tx) =>
      applyAdminCollectionAction(tx, {
        id: params.id,
        action: body.action as AdminCollectionAction,
        reason: typeof body.reason === 'string' ? body.reason : null,
        now: new Date(),
      }))
    return NextResponse.json({ collection: serializeCollection(record) })
  } catch (error) {
    return collectionErrorResponse(error)
  }
}
```

```ts
// app/api/admin/collections/settings/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { getSiteSetting, setSiteSetting } from '@/lib/site-settings'
import { collectionAuditContext, collectionErrorResponse, requireAdminSession } from '@/lib/collections/http'

export async function GET() {
  const { forbidden } = await requireAdminSession(auth)
  if (forbidden) return forbidden
  return NextResponse.json({ homeBlockEnabled: await getSiteSetting('collections_home_block_enabled') })
}

export async function PATCH(req: NextRequest) {
  const { session, forbidden } = await requireAdminSession(auth)
  if (forbidden) return forbidden
  const body = await req.json().catch(() => ({})) as { homeBlockEnabled?: unknown }
  if (typeof body.homeBlockEnabled !== 'boolean') {
    return NextResponse.json({ error: 'validation', issues: ['invalid_body'] }, { status: 400 })
  }
  const value = body.homeBlockEnabled
  try {
    await withAuditContext(collectionAuditContext(session, 'admin'), (tx) =>
      setSiteSetting(tx, 'collections_home_block_enabled', value))
    return NextResponse.json({ homeBlockEnabled: value })
  } catch (error) {
    return collectionErrorResponse(error)
  }
}
```

- [ ] **Step 4: Прогон** → PASS

- [ ] **Step 5: Коммит**

```bash
git add lib/collections/http.ts app/api/admin/collections
git commit -m "feat(collections): API модерации и переключатель блока на главной"
```

---

### Task 12: OpenAPI, документация, финальная проверка, PR

**Files:**
- Modify: `public/openapi.json`
- Create: `docs/features/collections.md`, `docs/wiki/Book-Collections.md`
- Modify: `docs/wiki/Data-and-Database.md`, `docs/wiki/API-and-Swagger.md`, `docs/wiki/Project-Map.md`, `docs/wiki/Home.md`

- [ ] **Step 1: OpenAPI.** Добавить в `paths` все роуты из «Общих контрактов» кроме OG (он в PR 2): теги `Public` для `/api/collections*`, `Collections` для `/api/me/collections*` и `/api/signup-books/{bookId}`, `Admin` для `/api/admin/collections*`. В `components/schemas` — `CollectionListItem`, `MyCollectionItem`, `SerializedCollection`, `AdminCollectionQueue`, `CollectionBookSearchResult`, `CollectionSnapshot`, `CollectionError` (`{ error: string, issues?: string[] }`). Формат — как у существующего `/api/intro`. Проверка: `node -e "JSON.parse(require('fs').readFileSync('public/openapi.json','utf8'))"`.

- [ ] **Step 2: `docs/features/collections.md`** — «как сделано в коде»: таблицы и смысл колонок (включая `submitted_at` и `site_settings.id`), правила из `rules.ts` (переходы, «перестановка не в очередь», права удаления), разница со снимком, роуты и коды ошибок, запись одной книги через `saveSignupSelection`, выкатка миграции и поведение до неё.

- [ ] **Step 3: `docs/wiki/Book-Collections.md`** — «что и зачем» для владельца: что такое подборка, статусы, модерация до и после публикации, где хранится, как применить миграцию на прод, что пока нет интерфейса (появится в следующих PR). Ссылки из `Home.md` и `Project-Map.md`; таблицы — в `Data-and-Database.md`; роуты — в `API-and-Swagger.md`.

- [ ] **Step 4: Полная проверка**

```bash
npm run lint && npm run typecheck && npm test
```

Ожидание: всё зелёное; число тестов выросло.

- [ ] **Step 5: Коммит и PR**

В ответе перед коммитом:
- «E2E: не нужен — PR добавляет только данные, логику и API; пользовательских флоу нет, всё покрыто Jest».
- «Wiki: нужна — новые таблицы, миграция, API endpoints (`docs/wiki/Book-Collections.md` и связанные страницы обновлены)».

```bash
git add public/openapi.json docs/features/collections.md docs/wiki
git commit -m "docs(collections): API, данные и выкатка подборок"
git push -u origin feat/collections-data-api
gh pr create --fill
gh pr merge --auto --squash --delete-branch
gh pr view --json number,mergeStateStatus,mergeable
```

Дальше — по правилам 2, 3, 8, 9 из `CLAUDE.md`: фоновое ожидание CI, фиксы в ту же ветку, `gh pr update-branch` при `BEHIND`. Задача PR закрыта, когда он смержен.

- [ ] **Step 6: После мержа** — сообщить владельцу: PR смержен; нужна прод-миграция командой из `00-overview.md`; worktree `../book-club-collections-1` можно удалить.
