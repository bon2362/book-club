# Book Priority Ranking (#41) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users can drag-and-drop their signed-up books into priority order in the profile drawer; admin sees priority ranks per book in the participants table.

**Architecture:** New `book_priorities` table in Postgres stores user-book rank pairs. Two new API routes handle reads/writes. ProfileDrawer gains drag-and-drop via @dnd-kit with debounced autosave. AdminPanel gains a book filter that fetches and displays priority data client-side.

**Tech Stack:** Next.js 14 route handlers, Drizzle ORM + Neon Postgres, @dnd-kit/core + @dnd-kit/sortable, Jest for unit tests.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/db/schema.ts` | Modify | Add `prioritiesSet` to `users`, add `bookPriorities` table |
| `drizzle/` | Generate | Migration SQL via `npx drizzle-kit generate` |
| `app/api/priorities/route.ts` | Create | GET (read ranks) + PUT (save ranks) |
| `app/api/priorities/route.test.ts` | Create | Unit tests for GET + PUT |
| `app/api/signup/route.ts` | Modify | Delete stale `book_priorities` rows after `upsertSignup` |
| `app/api/admin/priorities/route.ts` | Create | GET with `?book=` filter — returns users with priority fields |
| `app/api/admin/priorities/route.test.ts` | Create | Unit tests |
| `components/nd/ProfileDrawer.tsx` | Modify | Drag-and-drop list in «Записал:ась» tab, banner, autosave |
| `components/nd/AdminPanel.tsx` | Modify | Book filter dropdown + priority column in users view |

---

## Chunk 1: DB Schema + Migration + Package Install

### Task 1: Install @dnd-kit

- [ ] **Step 1: Install packages**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: packages installed, `package.json` updated.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: установить @dnd-kit/core, sortable, utilities"
```

---

### Task 2: Update DB schema

**Files:**
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Add `prioritiesSet` to `users` table**

In `lib/db/schema.ts`, update the `users` table definition:

```ts
export const users = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  languages: text('languages'),
  prioritiesSet: boolean('priorities_set').notNull().default(false),
})
```

- [ ] **Step 2: Add `bookPriorities` table**

At the bottom of `lib/db/schema.ts`, add:

```ts
export const bookPriorities = pgTable('book_priorities', {
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bookName:  text('book_name').notNull(),
  rank:      integer('rank').notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.bookName] }),
}))
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

---

### Task 3: Generate and apply migration

**Files:**
- Generate: `drizzle/0004_book_priorities.sql`

- [ ] **Step 1: Generate migration**

```bash
npx drizzle-kit generate
```

Expected: new file `drizzle/0004_book_priorities.sql` created with ALTER TABLE + CREATE TABLE statements.

- [ ] **Step 2: Verify the generated SQL looks correct**

Open `drizzle/0004_book_priorities.sql` and confirm it contains:
- `ALTER TABLE "user" ADD COLUMN "priorities_set" boolean DEFAULT false NOT NULL;`
- `CREATE TABLE "book_priorities" (...)`

- [ ] **Step 3: Verify existing rows get correct default**

After generating the SQL, confirm the ALTER TABLE statement includes `DEFAULT false` — this means all existing users will get `priorities_set = false`, which is correct (they haven't sorted yet). No backfill needed.

- [ ] **Step 4: Apply migration**

This project uses sequential migration files (see `drizzle/0000_*` through `drizzle/0003_*`). Use the migration runner, not push:

```bash
npx drizzle-kit migrate
```

Expected: migration applied, output shows `0004_book_priorities.sql` executed. **Do not use `drizzle-kit push`** — it bypasses migration files and can be destructive in production.

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(db): добавить таблицу book_priorities и флаг priorities_set"
```

---

## Chunk 2: API — GET/PUT /api/priorities

### Task 4: Write failing tests for GET /api/priorities

**Files:**
- Create: `app/api/priorities/route.test.ts`

- [ ] **Step 1: Create test file**

```ts
/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET, PUT } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
  },
}))

const mockAuth = authModule.auth as jest.Mock

// Helper: create a chainable Drizzle query mock that resolves with `rows` at the end.
// Drizzle chains are: .select().from().where().orderBy() — each returns `this`.
function makeSelectMock(rows: unknown[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockResolvedValue(rows),
    then: undefined as unknown,
  }
  return chain
}

// Note: `session.user.id` must be set in the auth session callback (`session.user.id = token.sub`).
// Confirm in `lib/auth.ts` that the session callback assigns `id`. Without it, queries return 0 rows silently.

function makeGet(url = 'http://localhost/api/priorities') {
  return new NextRequest(url, { method: 'GET' })
}

function makePut(body: object) {
  return new NextRequest('http://localhost/api/priorities', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('GET /api/priorities', () => {
  it('возвращает 401 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
  })

  it('возвращает [] если нет приоритетов', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    ;(db.select as jest.Mock).mockReturnValue(makeSelectMock([]))

    const res = await GET(makeGet())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual([])
  })

  it('возвращает приоритеты отсортированные по rank', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const rows = [
      { bookName: 'Книга А', rank: 1 },
      { bookName: 'Книга Б', rank: 2 },
    ]
    ;(db.select as jest.Mock).mockReturnValue(makeSelectMock(rows))

    const res = await GET(makeGet())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual(rows)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
npm test app/api/priorities/route.test.ts
```

Expected: FAIL — `Cannot find module './route'`

---

### Task 5: Implement GET /api/priorities

**Files:**
- Create: `app/api/priorities/route.ts`

- [ ] **Step 1: Create the GET handler**

```ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bookPriorities } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db
    .select({ bookName: bookPriorities.bookName, rank: bookPriorities.rank })
    .from(bookPriorities)
    .where(eq(bookPriorities.userId, session.user.id))
    .orderBy(asc(bookPriorities.rank))

  return NextResponse.json(rows)
}
```

- [ ] **Step 2: Run GET tests — expect PASS**

```bash
npm test app/api/priorities/route.test.ts -- --testNamePattern="GET"
```

Expected: 3 tests PASS.

---

### Task 6: Write failing tests for PUT /api/priorities

- [ ] **Step 1: Add PUT tests to `app/api/priorities/route.test.ts`**

Append to the existing test file:

```ts
describe('PUT /api/priorities', () => {
  it('возвращает 401 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await PUT(makePut({ books: ['Книга А'] }))
    expect(res.status).toBe(401)
  })

  it('возвращает 400 если books не массив', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const res = await PUT(makePut({ books: 'Книга А' }))
    expect(res.status).toBe(400)
  })

  it('возвращает 400 если books пустой массив', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    const res = await PUT(makePut({ books: [] }))
    expect(res.status).toBe(400)
  })

  it('сохраняет приоритеты и устанавливает prioritiesSet=true', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })

    const mockInsert = {
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
    }
    const mockDelete = {
      where: jest.fn().mockResolvedValue(undefined),
    }
    const mockUpdate = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(undefined),
    }
    ;(db.insert as jest.Mock).mockReturnValue(mockInsert)
    ;(db.delete as jest.Mock).mockReturnValue(mockDelete)
    ;(db.update as jest.Mock).mockReturnValue(mockUpdate)

    const res = await PUT(makePut({ books: ['Книга А', 'Книга Б'] }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(db.insert).toHaveBeenCalled()
    expect(db.update).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run PUT tests — expect FAIL (PUT not exported)**

```bash
npm test app/api/priorities/route.test.ts -- --testNamePattern="PUT"
```

Expected: FAIL — `PUT is not a function`

---

### Task 7: Implement PUT /api/priorities

**Files:**
- Modify: `app/api/priorities/route.ts`

- [ ] **Step 1: Add PUT handler to the route file**

> **Design decision:** `books: []` returns 400. Rationale: PUT is only called after the user has dragged at least one item — if `books` is empty, either the user has no signed-up books (in which case the UI doesn't render the drag list) or there's a client bug. Empty priority saves have no meaning and could accidentally delete all stored priorities.

Add to `app/api/priorities/route.ts`:

```ts
import { and, notInArray } from 'drizzle-orm'
import { users } from '@/lib/db/schema'

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { books } = body as { books: unknown }

  // Validate: must be a non-empty array of strings
  if (
    !Array.isArray(books) ||
    books.length === 0 ||
    books.some(b => typeof b !== 'string' || !b.trim())
  ) {
    return NextResponse.json({ error: 'books must be a non-empty array of strings' }, { status: 400 })
  }

  const validBooks = (books as string[]).map(b => b.trim()).filter(Boolean)

  const userId = session.user.id
  const now = new Date()

  // Upsert all priority rows
  await db
    .insert(bookPriorities)
    .values(
      validBooks.map((bookName, index) => ({
        userId,
        bookName,
        rank: index + 1,
        updatedAt: now,
      }))
    )
    .onConflictDoUpdate({
      target: [bookPriorities.userId, bookPriorities.bookName],
      set: {
        rank: sql`excluded.rank`,
        updatedAt: now,
      },
    })

  // Delete priorities for books no longer in the list.
  // validBooks is guaranteed non-empty (validated above), so notInArray is safe.
  await db
    .delete(bookPriorities)
    .where(
      and(
        eq(bookPriorities.userId, userId),
        notInArray(bookPriorities.bookName, validBooks)
      )
    )

  // Mark that user has set priorities at least once
  await db
    .update(users)
    .set({ prioritiesSet: true })
    .where(eq(users.id, userId))

  return NextResponse.json({ ok: true })
}
```

> **Note on upsert:** Drizzle's `onConflictDoUpdate` with per-row values requires using `sql` template for the set clause. Replace the `rank` set with:
> ```ts
> set: { rank: sql`excluded.rank`, updatedAt: now }
> ```
> Import `sql` from `drizzle-orm`.

- [ ] **Step 2: Run all priorities tests — expect PASS**

```bash
npm test app/api/priorities/route.test.ts
```

Expected: all tests PASS.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/priorities/
git commit -m "feat(api): GET/PUT /api/priorities — сохранение приоритетов книг"
```

---

## Chunk 3: Cleanup priorities on unsubscribe

> **Requires:** Chunk 1 completed (table `book_priorities` exists in schema and DB, `prioritiesSet` column on `users` exists).

### Task 8: Update /api/signup to delete stale priorities

**Files:**
- Modify: `app/api/signup/route.ts`
- Modify: `app/api/signup/route.test.ts`

- [ ] **Step 1: Add a failing test for priority cleanup**

In `app/api/signup/route.test.ts`, add at the top of mocks:

```ts
jest.mock('@/lib/db', () => ({
  db: {
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  },
}))
jest.mock('@/lib/db/schema', () => ({
  bookPriorities: {},
}))
```

Add this test to the describe block:

```ts
it('удаляет приоритеты для книг, которых нет в новом списке', async () => {
  const { db } = await import('@/lib/db')
  mockAuth.mockResolvedValue({ user: { email: 'test@test.com', id: 'user-1' } })
  mockUpsertSignup.mockResolvedValue({ isNew: false, addedBooks: [] })

  await POST(makeRequest({ name: 'Test', contacts: '@t', selectedBooks: ['Книга А'] }))

  expect(db.delete).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test app/api/signup/route.test.ts -- --testNamePattern="удаляет приоритеты"
```

Expected: FAIL — db.delete not called.

- [ ] **Step 3: Update /api/signup/route.ts**

> **Key:** `book_priorities.user_id` stores the Postgres `users.id` (the NextAuth subject/UUID), not the email. `/api/signup` receives `session.user.id` (set in the session callback via `session.user.id = token.sub`). Use `session.user.id` — not `session.user.email` — for the priority cleanup query.

Add imports at the top:

```ts
import { db } from '@/lib/db'
import { bookPriorities } from '@/lib/db/schema'
import { and, eq, notInArray } from 'drizzle-orm'
```

After the `upsertSignup` call and before the Resend block, add:

```ts
  // Clean up book_priorities for books no longer in selectedBooks.
  // Uses session.user.id (Postgres user UUID), not session.user.email (Sheets userId).
  const pgUserId = session.user.id
  if (pgUserId) {
    if ((selectedBooks as string[]).length > 0) {
      await db
        .delete(bookPriorities)
        .where(
          and(
            eq(bookPriorities.userId, pgUserId),
            notInArray(bookPriorities.bookName, selectedBooks as string[])
          )
        )
        .catch(() => {}) // non-critical — don't fail the request
    } else {
      // All books removed — delete all priorities for this user
      await db
        .delete(bookPriorities)
        .where(eq(bookPriorities.userId, pgUserId))
        .catch(() => {})
    }
  }
```

- [ ] **Step 4: Run all signup tests — expect PASS**

```bash
npm test app/api/signup/route.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/signup/route.ts app/api/signup/route.test.ts
git commit -m "feat(api): очищать book_priorities при отписке от книги"
```

---

## Chunk 4: ProfileDrawer — drag-and-drop UI

> **Requires:** Chunk 1 completed (`@dnd-kit` installed, DB schema ready), Chunk 2 completed (`GET /api/priorities` and `PUT /api/priorities` routes exist).

### Task 9: Add priority state and data loading to ProfileDrawer

**Files:**
- Modify: `components/nd/ProfileDrawer.tsx`

- [ ] **Step 1: Add priority state and load on tab open**

In the state declarations section (after `// ── Book toggle state` block), add:

```ts
// ── Book priorities (Записал:ась tab) ──
const [priorityOrder, setPriorityOrder] = useState<string[]>([]) // book names in rank order
const [prioritiesLoaded, setPrioritiesLoaded] = useState(false)
const [prioritiesSet, setPrioritiesSet] = useState(false) // true = user has sorted at least once
const [prioritiesSaving, setPrioritiesSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
const prioritiesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

Add cleanup for the debounce ref in the existing unmount cleanup:

```ts
useEffect(() => {
  return () => {
    if (prioritiesDebounceRef.current) clearTimeout(prioritiesDebounceRef.current)
  }
}, [])
```

- [ ] **Step 2: Load priorities when drawer opens on signup tab**

Add after the submissions loading useEffect:

```ts
// ── Load priorities on signup tab activation ──
useEffect(() => {
  if (!isOpen || activeTab !== 'signup' || prioritiesLoaded) return
  fetch('/api/priorities')
    .then(r => r.json())
    .then((data: { bookName: string; rank: number }[]) => {
      // Merge saved ranks with current selectedBooks
      // Books with saved ranks go in rank order; new books appended at end
      const rankedNames = data.map(d => d.bookName)
      const unranked = selectedBooks.filter(b => !rankedNames.includes(b))
      const merged = [...rankedNames.filter(b => selectedBooks.includes(b)), ...unranked]
      setPriorityOrder(merged.length > 0 ? merged : [...selectedBooks])
      setPrioritiesSet(data.length > 0)
      setPrioritiesLoaded(true)
    })
    .catch(() => {
      // fallback: use selectedBooks order
      setPriorityOrder([...selectedBooks])
      setPrioritiesLoaded(true)
    })
}, [isOpen, activeTab, prioritiesLoaded, selectedBooks])
```

- [ ] **Step 3: Add savePriorities function**

Add after `handleToggle`:

```ts
// savePriorities receives both `order` and `unsubscribed` explicitly to avoid
// stale closure inside the debounce callback (localUnsubscribed state would be frozen
// at the time setTimeout was scheduled, not at the time it fires).
function savePriorities(order: string[], unsubscribed: Set<string>) {
  if (prioritiesDebounceRef.current) clearTimeout(prioritiesDebounceRef.current)
  prioritiesDebounceRef.current = setTimeout(async () => {
    // Only save books the user is currently subscribed to
    const booksToSave = order.filter(b => !unsubscribed.has(b))
    if (booksToSave.length === 0) return
    setPrioritiesSaving('saving')
    try {
      await fetch('/api/priorities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books: booksToSave }),
      })
      setPrioritiesSet(true)
      setPrioritiesSaving('saved')
      setTimeout(() => setPrioritiesSaving('idle'), 2000)
    } catch {
      setPrioritiesSaving('idle')
    }
  }, 500)
}
```

---

### Task 10: Render sortable list in «Записал:ась» tab

**Files:**
- Modify: `components/nd/ProfileDrawer.tsx`

- [ ] **Step 1: Add dnd-kit imports at top of file**

```ts
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
```

- [ ] **Step 2: Add SortableBookItem component** (outside ProfileDrawer, at top of file)

```tsx
function SortableBookItem({
  id,
  rank,
  name,
  author,
  isUnsubscribed,
  onToggle,
}: {
  id: string
  rank: number
  name: string
  author: string
  isUnsubscribed: boolean
  onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    borderBottom: '1px solid #f3f4f6',
    background: '#fff',
    userSelect: 'none',
  }

  const rankColors = ['#f97316', '#fb923c', '#fdba74']
  const rankBg = rank <= 3 ? rankColors[rank - 1] : '#e5e7eb'
  const rankColor = rank <= 3 ? 'white' : '#6b7280'

  return (
    <div ref={setNodeRef} style={style}>
      <span style={{
        width: 24, height: 24, borderRadius: '50%',
        background: isUnsubscribed ? '#e5e7eb' : rankBg,
        color: isUnsubscribed ? '#9ca3af' : rankColor,
        fontSize: 11, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginRight: 10,
      }}>
        {rank}
      </span>
      <span
        {...attributes}
        {...listeners}
        style={{ color: '#d1d5db', fontSize: 18, marginRight: 10, cursor: 'grab', lineHeight: 1, touchAction: 'none' }}
        aria-label="Перетащить"
      >
        ⠿
      </span>
      <span style={{
        flex: 1, fontSize: 14,
        fontWeight: isUnsubscribed ? 'normal' : 500,
        textDecoration: isUnsubscribed ? 'line-through' : 'none',
        color: isUnsubscribed ? '#9ca3af' : '#111',
      }}>
        {name}
      </span>
      <span style={{ fontSize: 11, color: '#9ca3af', marginRight: 8 }}>{author}</span>
      <button
        onClick={onToggle}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: isUnsubscribed ? '#22c55e' : '#9ca3af',
          fontSize: 13, padding: '0 4px',
        }}
        title={isUnsubscribed ? 'Вернуть' : 'Отписаться'}
      >
        {isUnsubscribed ? '↩' : '×'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Add handleDragEnd function** (inside ProfileDrawer, after savePriorities):

```ts
function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event
  if (!over || active.id === over.id) return
  const oldIndex = priorityOrder.indexOf(active.id as string)
  const newIndex = priorityOrder.indexOf(over.id as string)
  const newOrder = arrayMove(priorityOrder, oldIndex, newIndex)
  setPriorityOrder(newOrder)
  savePriorities(newOrder, localUnsubscribed)
}
```

- [ ] **Step 4: Set up dnd sensors** (inside ProfileDrawer, before return):

```ts
const sensors = useSensors(
  useSensor(PointerSensor),
  useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  })
)
```

- [ ] **Step 5: Replace the «Записал:ась» tab render section**

Find the section that renders `signedUpBooks` (the existing list) in the tab `signup` JSX. Replace it with:

```tsx
{activeTab === 'signup' && (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    {/* Banner — shown until user has sorted at least once */}
    {prioritiesLoaded && !prioritiesSet && selectedBooks.length > 0 && (
      <div style={{
        padding: '10px 16px', background: '#fff7ed',
        borderBottom: '1px solid #fed7aa',
        fontSize: 12, color: '#9a3412', lineHeight: 1.5,
      }}>
        <strong>Расставь книги по интересу:</strong> перетащи их так, чтобы сверху оказались те, которые хочется прочитать сильнее всего. Это поможет подобрать тебе подходящую группу.
      </div>
    )}

    {/* Sortable list */}
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {priorityOrder.length === 0 && selectedBooks.length === 0 ? (
        <div style={{ padding: '24px 16px', color: '#9ca3af', fontSize: 14, textAlign: 'center' }}>
          Ты пока не записал:ась ни на одну книгу
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={priorityOrder} strategy={verticalListSortingStrategy}>
            {priorityOrder.map((bookName, index) => {
              const book = books.find(b => b.name === bookName)
              if (!book) return null
              return (
                <SortableBookItem
                  key={bookName}
                  id={bookName}
                  rank={index + 1}
                  name={bookName}
                  author={book.author}
                  isUnsubscribed={localUnsubscribed.has(bookName)}
                  onToggle={() => handleToggle(bookName)}
                />
              )
            })}
          </SortableContext>
        </DndContext>
      )}
    </div>

    {/* Autosave indicator */}
    {prioritiesLoaded && selectedBooks.length > 0 && (
      <div style={{
        padding: '10px 16px', borderTop: '1px solid #e5e7eb',
        fontSize: 12, color: '#9ca3af',
        display: 'flex', justifyContent: 'flex-end',
      }}>
        {prioritiesSaving === 'saving' && <span>Сохранение...</span>}
        {prioritiesSaving === 'saved' && <span style={{ color: '#22c55e' }}>✓ Сохранено</span>}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Verify tests still pass**

```bash
npm test
```

Expected: all existing tests PASS.

- [ ] **Step 8: Commit**

```bash
git add components/nd/ProfileDrawer.tsx
git commit -m "feat(ui): drag-and-drop приоритеты книг в личном кабинете"
```

---

## Chunk 5: Admin panel — book filter + priority column

> **Requires:** Chunk 1 completed (`book_priorities` table and `prioritiesSet` column exist in DB and schema).

### Task 11: Create /api/admin/priorities route

**Files:**
- Create: `app/api/admin/priorities/route.ts`
- Create: `app/api/admin/priorities/route.test.ts`

- [ ] **Step 1: Write failing test**

```ts
/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET } from './route'
import * as authModule from '@/lib/auth'
import * as signupsModule from '@/lib/signups'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/signups', () => ({ getAllSignups: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: { select: jest.fn() },
}))

const mockAuth = authModule.auth as jest.Mock
const mockGetAllSignups = signupsModule.getAllSignups as jest.Mock

function makeGet(book?: string) {
  const url = book
    ? `http://localhost/api/admin/priorities?book=${encodeURIComponent(book)}`
    : 'http://localhost/api/admin/priorities'
  return new NextRequest(url, { method: 'GET' })
}

describe('GET /api/admin/priorities', () => {
  it('возвращает 403 без isAdmin', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await GET(makeGet('Книга А'))
    expect(res.status).toBe(403)
  })

  it('возвращает 400 без параметра book', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    const res = await GET(makeGet())
    expect(res.status).toBe(400)
  })

  it('возвращает участников с priority=null если не расставляли', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    mockGetAllSignups.mockResolvedValue([
      { userId: 'user-1', name: 'Иван', email: 'a@a.com', contacts: '@ivan', selectedBooks: ['Книга А'], timestamp: '' },
    ])

    const mockSelect = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([
        // No priority rows for user-1
      ]),
    }
    // For users table query (prioritiesSet)
    const mockSelectUsers = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([
        { id: 'user-1', prioritiesSet: false },
      ]),
    }
    ;(db.select as jest.Mock)
      .mockReturnValueOnce(mockSelectUsers) // users query
      .mockReturnValueOnce(mockSelect)       // book_priorities query

    const res = await GET(makeGet('Книга А'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.users[0].priority).toBeNull()
    expect(data.users[0].prioritiesSet).toBe(false)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test app/api/admin/priorities/route.test.ts
```

Expected: FAIL — Cannot find module.

- [ ] **Step 3: Implement the route**

```ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAllSignups } from '@/lib/signups'
import { db } from '@/lib/db'
import { bookPriorities, users } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const bookName = req.nextUrl.searchParams.get('book')
  if (!bookName) {
    return NextResponse.json({ error: 'Missing book parameter' }, { status: 400 })
  }

  const signups = await getAllSignups()
  const bookSignups = signups.filter(s => s.selectedBooks.includes(bookName))

  if (bookSignups.length === 0) {
    return NextResponse.json({ users: [] })
  }

  const userIds = bookSignups.map(s => s.userId)

  // Fetch prioritiesSet flag for each user
  const userRows = await db
    .select({ id: users.id, prioritiesSet: users.prioritiesSet })
    .from(users)
    .where(inArray(users.id, userIds))

  const userFlagMap = Object.fromEntries(userRows.map(r => [r.id, r.prioritiesSet]))

  // Fetch priority rows for this specific book
  const priorityRows = await db
    .select({ userId: bookPriorities.userId, rank: bookPriorities.rank, updatedAt: bookPriorities.updatedAt })
    .from(bookPriorities)
    .where(
      inArray(bookPriorities.userId, userIds)
    )
    .then(rows => rows.filter(r =>
      // We need rank for this specific book — re-fetch with bookName filter
      true
    ))

  // Re-fetch with bookName filter for accuracy
  const specificPriorityRows = await db
    .select({
      userId: bookPriorities.userId,
      rank: bookPriorities.rank,
      updatedAt: bookPriorities.updatedAt,
    })
    .from(bookPriorities)
    .where(inArray(bookPriorities.userId, userIds))
    .then(rows => rows.filter(r => {
      // We need to join on bookName too — use SQL directly
      return true // placeholder, see below
    }))

  // Note: The above is a placeholder. Use the proper filtered query:
  // Actually Drizzle can chain .where() with `and`:
  // .where(and(eq(bookPriorities.bookName, bookName), inArray(bookPriorities.userId, userIds)))

  const priorityMap = Object.fromEntries(
    specificPriorityRows.map(r => [r.userId, { rank: r.rank, updatedAt: r.updatedAt }])
  )

  // Count total books per user (for "№ X из N" display)
  const totalBooksMap = Object.fromEntries(
    bookSignups.map(s => [s.userId, s.selectedBooks.length])
  )

  const result = bookSignups.map(s => ({
    ...s,
    priority: priorityMap[s.userId]?.rank ?? null,
    totalBooks: userFlagMap[s.userId] ? totalBooksMap[s.userId] : null,
    prioritiesSet: userFlagMap[s.userId] ?? false,
    priorityUpdatedAt: priorityMap[s.userId]?.updatedAt ?? null,
  }))

  // Sort: prioritiesSet=true first (by rank ASC, then updatedAt ASC), then prioritiesSet=false
  result.sort((a, b) => {
    if (a.prioritiesSet && !b.prioritiesSet) return -1
    if (!a.prioritiesSet && b.prioritiesSet) return 1
    if (a.priority !== null && b.priority !== null) {
      if (a.priority !== b.priority) return a.priority - b.priority
      // tiebreak: earlier updatedAt first
      const aTime = a.priorityUpdatedAt ? new Date(a.priorityUpdatedAt).getTime() : 0
      const bTime = b.priorityUpdatedAt ? new Date(b.priorityUpdatedAt).getTime() : 0
      return aTime - bTime
    }
    return 0
  })

  return NextResponse.json({ users: result })
}
```

> **IMPORTANT:** The priority fetch has a placeholder bug. Replace the `specificPriorityRows` fetch with the correct filtered query using `and()`:

```ts
import { and } from 'drizzle-orm'

const specificPriorityRows = await db
  .select({
    userId: bookPriorities.userId,
    rank: bookPriorities.rank,
    updatedAt: bookPriorities.updatedAt,
  })
  .from(bookPriorities)
  .where(
    and(
      eq(bookPriorities.bookName, bookName),
      inArray(bookPriorities.userId, userIds)
    )
  )
```

Remove the two intermediate `priorityRows` variables. The final file should have only `specificPriorityRows`.

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test app/api/admin/priorities/route.test.ts
```

Expected: PASS (or fix any type errors).

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/priorities/
git commit -m "feat(api): GET /api/admin/priorities?book= — приоритеты участников по книге"
```

---

### Task 12: Update AdminPanel with book filter and priority column

**Files:**
- Modify: `components/nd/AdminPanel.tsx`

- [ ] **Step 1: Add priority state to AdminPanel**

In the state declarations (after `const [newFlagLoading, ...]`), add:

```ts
// ── Book filter + priorities (users tab) ──
const [bookFilter, setBookFilter] = useState<string>('')
const [priorityUsers, setPriorityUsers] = useState<PriorityUser[]>([])
const [priorityLoading, setPriorityLoading] = useState(false)
```

Add the `PriorityUser` interface near the top of the file, after the `Submission` interface:

```ts
interface PriorityUser {
  userId: string
  name: string
  contacts: string
  email: string
  selectedBooks: string[]
  priority: number | null
  totalBooks: number | null
  prioritiesSet: boolean
}
```

- [ ] **Step 2: Add useEffect to fetch priority data on book filter change**

```ts
useEffect(() => {
  if (!bookFilter) {
    setPriorityUsers([])
    return
  }
  setPriorityLoading(true)
  fetch(`/api/admin/priorities?book=${encodeURIComponent(bookFilter)}`)
    .then(r => r.json())
    .then(d => setPriorityUsers(d.users ?? []))
    .catch(() => setPriorityUsers([]))
    .finally(() => setPriorityLoading(false))
}, [bookFilter])
```

- [ ] **Step 3: Add book filter dropdown and update users table render**

In the `{view === 'users' && (` block, before the `<table>`:

```tsx
{/* Book filter */}
<div style={{ padding: '0.5rem 0', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
  <label style={{ ...fieldLabel, marginBottom: 0 }}>Фильтр по книге:</label>
  <select
    value={bookFilter}
    onChange={e => setBookFilter(e.target.value)}
    style={{ ...fieldInput, width: 'auto', minWidth: 200 }}
  >
    <option value="">— все участники —</option>
    {Array.from(new Set(localUsers.flatMap(u => u.selectedBooks))).sort().map(book => (
      <option key={book} value={book}>{book}</option>
    ))}
  </select>
  {bookFilter && (
    <button onClick={() => setBookFilter('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '0.8rem' }}>
      × сбросить
    </button>
  )}
</div>
```

- [ ] **Step 4: Add priority column to table header (conditionally)**

In the `<thead>` row, after `<th style={headCell}>Языки</th>`:

```tsx
{bookFilter && <th style={headCell}>Приоритет</th>}
```

- [ ] **Step 5: Update table body to show priority data when book filter is active**

Replace the `{localUsers.map(u => (` block with logic that uses `priorityUsers` when filter is active, `localUsers` otherwise. Before the tbody, add:

```tsx
const displayUsers = bookFilter ? priorityUsers : localUsers
```

Change `{localUsers.map(u => (` to `{displayUsers.map(u => (`.

Inside the row, after the languages `<td>`, add:

```tsx
{bookFilter && (
  <td style={cell}>
    {(u as PriorityUser).prioritiesSet === false || (u as PriorityUser).priority === null ? (
      <span style={{ color: '#ccc' }}>—</span>
    ) : (() => {
      const rank = (u as PriorityUser).priority!
      const total = (u as PriorityUser).totalBooks!
      const bg = rank <= 2 ? '#f97316' : rank === 3 ? '#fdba74' : '#e5e7eb'
      const color = rank <= 3 ? 'white' : '#6b7280'
      return (
        <span style={{ background: bg, color, borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 700 }}>
          №{rank} из {total}
        </span>
      )
    })()}
  </td>
)}
```

Also add a group divider between users with/without priorities when `bookFilter` is active. Find the right place in the tbody after sorted users end and add:

```tsx
{bookFilter && (() => {
  const withPriority = priorityUsers.filter(u => u.prioritiesSet)
  const withoutPriority = priorityUsers.filter(u => !u.prioritiesSet)
  if (withoutPriority.length === 0) return null
  // Find the boundary index
  const boundaryIdx = withPriority.length
  return displayUsers.indexOf(displayUsers[boundaryIdx]) === -1 ? null : (
    /* Divider rendered inline — see below */
    null
  )
})()}
```

> **NOTE:** The inline divider row requires a structural change. The cleanest approach: render two separate `<tbody>` sections or use a special sentinel row. In the `displayUsers.map()`, check if this is the first "without priorities" user and render a divider `<tr>` before it:

```tsx
{displayUsers.map((u, idx) => {
  const pu = u as PriorityUser
  const isFirstWithout = bookFilter && !pu.prioritiesSet &&
    (idx === 0 || (displayUsers[idx - 1] as PriorityUser).prioritiesSet)
  const withoutCount = bookFilter ? priorityUsers.filter(x => !x.prioritiesSet).length : 0
  return (
    <Fragment key={u.userId}>
      {isFirstWithout && (
        <tr>
          <td colSpan={7} style={{ ...cell, background: '#f3f4f6', color: '#9ca3af', fontStyle: 'italic', fontSize: '0.75rem' }}>
            Не расставили приоритеты ({withoutCount})
          </td>
        </tr>
      )}
      <tr style={bookFilter && !pu.prioritiesSet ? { color: '#9ca3af' } : {}}>
        {/* ... existing cells ... */}
      </tr>
    </Fragment>
  )
})}
```

Make sure `Fragment` is already imported at the top (it already is in this file).

- [ ] **Step 6: Show loading state while priority data fetches**

In the users view, wrap the table in a loading check:

```tsx
{priorityLoading ? (
  <div style={{ padding: '1rem', color: '#9ca3af', fontSize: '0.8rem' }}>Загрузка приоритетов...</div>
) : (
  <table ...>
    {/* ... */}
  </table>
)}
```

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: no errors. Fix any type assertion issues.

- [ ] **Step 8: Run all tests**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add components/nd/AdminPanel.tsx
git commit -m "feat(admin): фильтр по книге и колонка приоритетов в таблице участников"
```

---

## Final: smoke test and push

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Push**

```bash
git push
```

Expected: CI green, Vercel deploys automatically.
