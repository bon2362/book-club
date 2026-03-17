# Admin Panel — Book Priority Display — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each user's book priority ranking in the admin panel — ranked badges in the Участники tab, `(#N)` rank next to names in the По книгам tab, and priority re-ranking when admin removes a book.

**Architecture:** New server-side data maps (bookPrioritiesMap, prioritiesSetMap, emailToPgIdMap) are built in `admin/page.tsx` and passed as props to `AdminPanel`. Client-side local state mirrors priorities and updates optimistically after remove-book. The remove-book API route gains DB operations to delete and re-rank priorities after the existing Google Sheets update.

**Tech Stack:** Next.js 14, Drizzle ORM (Neon Postgres), React (client component), Jest + React Testing Library

---

## Chunk 1: API + Server Data

### Task 1: Add priority re-rank to remove-book API

**Files:**
- Modify: `app/api/admin/remove-book/route.ts`
- Modify: `app/api/admin/remove-book/route.test.ts`

- [ ] **Step 1.1: Add db mock to test file and set safe default**

  Open `app/api/admin/remove-book/route.test.ts`. Add the db mock at the top (after existing mocks) so existing tests keep passing — the default mock returns no user (priority step skips):

  ```ts
  import { db } from '@/lib/db'

  jest.mock('@/lib/db', () => ({
    db: {
      select: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
  }))
  ```

  Add to `beforeEach`:
  ```ts
  beforeEach(() => {
    // Default: no DB user found → priority step is skipped
    const defaultChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([]),
    }
    ;(db.select as jest.Mock).mockReturnValue(defaultChain)
    ;(db.delete as jest.Mock).mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) })
    ;(db.update as jest.Mock).mockReturnValue({ set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue(undefined) })
  })
  ```

- [ ] **Step 1.2: Write failing test — re-rank after remove**

  Add to `app/api/admin/remove-book/route.test.ts`, in a new describe block:

  ```ts
  describe('DELETE /api/admin/remove-book — priority re-rank', () => {
    it('удаляет приоритет и сдвигает ранги при удалении книги', async () => {
      mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
      mockRemoveBook.mockResolvedValue(undefined)

      // db.select called twice:
      // 1st: look up user by email → returns pgId
      // 2nd: look up priority rank for this book → returns rank 2
      const selectUserChain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ id: 'pg-user-1' }]),
      }
      const selectPriorityChain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ rank: 2 }]),
      }
      ;(db.select as jest.Mock)
        .mockReturnValueOnce(selectUserChain)
        .mockReturnValueOnce(selectPriorityChain)

      const mockDeleteWhere = jest.fn().mockResolvedValue(undefined)
      ;(db.delete as jest.Mock).mockReturnValue({ where: mockDeleteWhere })

      const mockUpdateWhere = jest.fn().mockResolvedValue(undefined)
      ;(db.update as jest.Mock).mockReturnValue({ set: jest.fn().mockReturnThis(), where: mockUpdateWhere })

      const res = await DELETE(makeRequest({ userId: 'user@test.com', bookName: 'Book B' }))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.ok).toBe(true)

      // delete priority row
      expect(db.delete).toHaveBeenCalledTimes(1)
      expect(mockDeleteWhere).toHaveBeenCalledTimes(1)

      // re-rank: UPDATE rank = rank - 1 WHERE rank > 2
      expect(db.update).toHaveBeenCalledTimes(1)
      expect(mockUpdateWhere).toHaveBeenCalledTimes(1)
    })

    it('пропускает re-rank если пользователь не найден в БД', async () => {
      mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
      mockRemoveBook.mockResolvedValue(undefined)

      // db.select returns empty (user not in DB)
      const emptyChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) }
      ;(db.select as jest.Mock).mockReturnValueOnce(emptyChain)

      const res = await DELETE(makeRequest({ userId: 'unknown@test.com', bookName: 'Book A' }))
      expect(res.status).toBe(200)
      expect(db.delete).not.toHaveBeenCalled()
      expect(db.update).not.toHaveBeenCalled()
    })

    it('пропускает re-rank если нет записи приоритета для книги', async () => {
      mockAuth.mockResolvedValue({ user: { email: 'admin@test.com', isAdmin: true } })
      mockRemoveBook.mockResolvedValue(undefined)

      const selectUserChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([{ id: 'pg-user-1' }]) }
      const selectNoPriorityChain = { from: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue([]) }
      ;(db.select as jest.Mock)
        .mockReturnValueOnce(selectUserChain)
        .mockReturnValueOnce(selectNoPriorityChain)

      const res = await DELETE(makeRequest({ userId: 'user@test.com', bookName: 'Book A' }))
      expect(res.status).toBe(200)
      expect(db.delete).not.toHaveBeenCalled()
      expect(db.update).not.toHaveBeenCalled()
    })
  })
  ```

- [ ] **Step 1.3: Run tests to verify they fail**

  ```bash
  npx jest app/api/admin/remove-book/route.test.ts --no-coverage
  ```

  Expected: new tests FAIL with errors like "db.delete is not a function" or "Cannot read properties of undefined"

- [ ] **Step 1.4: Implement re-rank logic in route**

  Replace the entire `app/api/admin/remove-book/route.ts` with:

  ```ts
  export const dynamic = 'force-dynamic'

  import { NextRequest, NextResponse } from 'next/server'
  import { auth } from '@/lib/auth'
  import { removeBookFromSignup } from '@/lib/signups'
  import { db } from '@/lib/db'
  import { bookPriorities, users } from '@/lib/db/schema'
  import { eq, and, gt, sql } from 'drizzle-orm'

  export async function DELETE(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { userId, bookName } = await req.json() as { userId: string; bookName: string }
    if (!userId || !bookName) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    await removeBookFromSignup(userId, bookName)

    // userId in signups = user's email; look up pgId
    const userRows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, userId))
    const pgUser = userRows[0]
    if (!pgUser) return NextResponse.json({ ok: true })

    // Find this book's current rank
    const existing = await db
      .select({ rank: bookPriorities.rank })
      .from(bookPriorities)
      .where(and(eq(bookPriorities.userId, pgUser.id), eq(bookPriorities.bookName, bookName)))
    const priorityRow = existing[0]
    if (!priorityRow) return NextResponse.json({ ok: true })

    const deletedRank = priorityRow.rank

    // Delete the priority entry
    await db
      .delete(bookPriorities)
      .where(and(eq(bookPriorities.userId, pgUser.id), eq(bookPriorities.bookName, bookName)))

    // Re-rank: close the gap (rank > deletedRank → rank - 1)
    await db
      .update(bookPriorities)
      .set({ rank: sql`${bookPriorities.rank} - 1` })
      .where(and(eq(bookPriorities.userId, pgUser.id), gt(bookPriorities.rank, deletedRank)))

    return NextResponse.json({ ok: true })
  }
  ```

- [ ] **Step 1.5: Run all remove-book tests**

  ```bash
  npx jest app/api/admin/remove-book/route.test.ts --no-coverage
  ```

  Expected: all tests PASS

- [ ] **Step 1.6: Run lint + typecheck**

  ```bash
  npm run lint && npm run typecheck
  ```

  Expected: no errors

- [ ] **Step 1.7: Commit**

  ```bash
  git add app/api/admin/remove-book/route.ts app/api/admin/remove-book/route.test.ts
  git commit -m "feat(admin): re-rank book priorities on remove-book"
  ```

---

### Task 2: Server data — extend admin/page.tsx queries

**Files:**
- Modify: `app/admin/page.tsx`
- Modify: `components/nd/AdminPanel.tsx` (Props interface + state init only, no UI yet)
- Modify: `components/nd/AdminPanel.test.tsx` (add new props to defaultProps)

- [ ] **Step 2.1: Update AdminPanel Props interface and defaultProps in test**

  In `components/nd/AdminPanel.tsx`, find the `interface Props` block (lines 44–52) and replace it:

  ```ts
  interface Props {
    users: UserSignup[]
    byBook: BookEntry[]
    statuses: Record<string, 'reading' | 'read'>
    allTags: string[]
    tagDescriptions: Record<string, string>
    newFlags: Record<string, boolean>
    userLanguages?: Record<string, string[]>
    bookPrioritiesMap: Record<string, { bookName: string; rank: number }[]>
    prioritiesSetMap: Record<string, boolean>
    emailToPgIdMap: Record<string, string>
  }
  ```

  In `components/nd/AdminPanel.test.tsx`, update `defaultProps`:

  ```ts
  const defaultProps = {
    users: [],
    byBook: [],
    statuses: {},
    allTags: [],
    tagDescriptions: {},
    newFlags: {},
    bookPrioritiesMap: {},
    prioritiesSetMap: {},
    emailToPgIdMap: {},
  }
  ```

- [ ] **Step 2.2: Run AdminPanel tests to verify they still pass**

  ```bash
  npx jest components/nd/AdminPanel.test.tsx --no-coverage
  ```

  Expected: all tests PASS (new props have empty defaults, no UI changes yet)

- [ ] **Step 2.3: Extend admin/page.tsx queries**

  In `app/admin/page.tsx`, update the imports line (line 6) to add `bookPriorities`:

  ```ts
  import { bookStatuses, tagDescriptions, bookNewFlags, users, bookPriorities } from '@/lib/db/schema'
  ```

  Replace the `Promise.all` call (lines 17–24) with:

  ```ts
  const [signups, books, statuses, tagDescs, newFlags, languageRows, allPriorityRows] = await Promise.all([
    getAllSignups(),
    fetchBooksWithCovers(),
    db.select().from(bookStatuses).catch(() => []),
    db.select().from(tagDescriptions).catch(() => []),
    db.select().from(bookNewFlags).catch(() => []),
    db.select({ id: users.id, email: users.email, languages: users.languages, prioritiesSet: users.prioritiesSet }).from(users).catch(() => []),
    db.select({ userId: bookPriorities.userId, bookName: bookPriorities.bookName, rank: bookPriorities.rank }).from(bookPriorities).catch(() => []),
  ])
  ```

  Update the `userLanguagesMap` block (lines 26–31) to also build the three new maps:

  ```ts
  const userLanguagesMap: Record<string, string[]> = {}
  const emailToPgIdMap: Record<string, string> = {}
  const prioritiesSetMap: Record<string, boolean> = {}
  for (const row of languageRows) {
    if (row.email && row.id) {
      emailToPgIdMap[row.email] = row.id
      prioritiesSetMap[row.id] = row.prioritiesSet ?? false
    }
    if (row.languages && row.email) {
      try { userLanguagesMap[row.email] = JSON.parse(row.languages) } catch { /* skip */ }
    }
  }

  const bookPrioritiesMap: Record<string, { bookName: string; rank: number }[]> = {}
  for (const row of allPriorityRows) {
    if (!bookPrioritiesMap[row.userId]) bookPrioritiesMap[row.userId] = []
    bookPrioritiesMap[row.userId].push({ bookName: row.bookName, rank: row.rank })
  }
  for (const pgId of Object.keys(bookPrioritiesMap)) {
    bookPrioritiesMap[pgId].sort((a, b) => a.rank - b.rank)
  }
  ```

  Update the `<AdminPanel>` JSX (line 62) to pass the new props:

  ```tsx
  <AdminPanel
    users={signups}
    byBook={byBook}
    statuses={statusMap}
    allTags={allTags}
    tagDescriptions={tagDescMap}
    newFlags={newFlagsMap}
    userLanguages={userLanguagesMap}
    bookPrioritiesMap={bookPrioritiesMap}
    prioritiesSetMap={prioritiesSetMap}
    emailToPgIdMap={emailToPgIdMap}
  />
  ```

- [ ] **Step 2.4: Update AdminPanel function signature to accept new props**

  In `components/nd/AdminPanel.tsx`, find line 101 (function signature) and update:

  ```ts
  export default function AdminPanel({
    users,
    byBook,
    statuses: initialStatuses,
    allTags,
    tagDescriptions: initialTagDescriptions,
    newFlags: initialNewFlags,
    userLanguages = {},
    bookPrioritiesMap,
    prioritiesSetMap,
    emailToPgIdMap,
  }: Props) {
  ```

  Add `localPrioritiesMap` state after the existing `localUsers` state (around line 103):

  ```ts
  const [localPrioritiesMap, setLocalPrioritiesMap] = useState<Record<string, { bookName: string; rank: number }[]>>(bookPrioritiesMap)
  ```

- [ ] **Step 2.5: Run lint + typecheck**

  ```bash
  npm run lint && npm run typecheck
  ```

  Expected: no errors

- [ ] **Step 2.6: Run all tests**

  ```bash
  npm test -- --testPathPattern="admin" --no-coverage
  ```

  Expected: all tests PASS

- [ ] **Step 2.7: Commit**

  ```bash
  git add app/admin/page.tsx components/nd/AdminPanel.tsx components/nd/AdminPanel.test.tsx
  git commit -m "feat(admin): pass bookPrioritiesMap and emailToPgIdMap to AdminPanel"
  ```

---

## Chunk 2: UI Changes

### Task 3: Участники tab — remove book filter, redesign badges

**Files:**
- Modify: `components/nd/AdminPanel.tsx`

- [ ] **Step 3.1: Remove book filter state and useEffect**

  In `components/nd/AdminPanel.tsx`:

  Remove these state declarations (around lines 120–123):
  ```ts
  // ── Book filter + priorities (users tab) ──
  const [bookFilter, setBookFilter] = useState<string>('')
  const [priorityUsers, setPriorityUsers] = useState<PriorityUser[]>([])
  const [priorityLoading, setPriorityLoading] = useState(false)
  ```

  Remove the `useEffect` that fetches priorities (lines 141–152):
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

  Remove the `PriorityUser` interface (lines 28–37):
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

- [ ] **Step 3.2: Update handleRemoveBook to update localPrioritiesMap**

  Replace `handleRemoveBook` function (lines 169–184) with:

  ```ts
  async function handleRemoveBook(userId: string, bookName: string, userName: string) {
    if (!window.confirm(`Снять ${userName} с книги «${bookName}»?`)) return
    try {
      const res = await fetch('/api/admin/remove-book', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, bookName }),
      })
      if (!res.ok) return
      setLocalUsers(prev =>
        prev.map(u => u.userId === userId ? { ...u, selectedBooks: u.selectedBooks.filter(b => b !== bookName) } : u)
      )
      setLocalPrioritiesMap(prev => {
        const pgId = emailToPgIdMap[userId]
        if (!pgId) return prev
        const books = prev[pgId] ?? []
        const removed = books.find(b => b.bookName === bookName)
        if (!removed) return prev
        const updated = books
          .filter(b => b.bookName !== bookName)
          .map(b => b.rank > removed.rank ? { ...b, rank: b.rank - 1 } : b)
        return { ...prev, [pgId]: updated }
      })
    } catch {
      // silently ignore
    }
  }
  ```

- [ ] **Step 3.3: Replace the Участники tab UI**

  Find the entire `{view === 'users' && (` block (lines 427–541). Replace the book filter section AND the table with:

  ```tsx
  {view === 'users' && (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={headCell}>Имя</th>
            <th style={headCell}>Telegram</th>
            <th style={headCell}>Email</th>
            <th style={headCell}>Языки</th>
            <th style={headCell}>Книги</th>
            <th style={headCell}></th>
          </tr>
        </thead>
        <tbody>
          {localUsers.map(u => {
            const pgId = emailToPgIdMap[u.userId]
            const priSet = pgId ? (prioritiesSetMap[pgId] ?? false) : false
            const userPriorities = pgId ? (localPrioritiesMap[pgId] ?? []) : []
            const rankMap = new Map(userPriorities.map(p => [p.bookName, p.rank]))
            const ranked = u.selectedBooks
              .filter(b => rankMap.has(b))
              .sort((a, b) => rankMap.get(a)! - rankMap.get(b)!)
            const unranked = u.selectedBooks.filter(b => !rankMap.has(b))
            const sortedBooks = priSet ? [...ranked, ...unranked] : u.selectedBooks
            return (
              <tr key={u.userId}>
                <td style={cell}>{u.name}</td>
                <td style={cell}>{u.contacts}</td>
                <td style={{ ...cell, color: '#666' }}>{u.email}</td>
                <td style={{ ...cell, color: '#666' }}>
                  {(userLanguages[u.userId] ?? []).join(', ') || <span style={{ color: '#ccc' }}>—</span>}
                </td>
                <td style={cell}>
                  {!priSet && (
                    <div style={{ fontSize: '0.65rem', color: '#aaa', fontStyle: 'italic', marginBottom: '0.25rem' }}>
                      Приоритеты не расставлены
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    {sortedBooks.map(book => {
                      const rank = rankMap.get(book)
                      const numLabel = !priSet ? '?' : rank !== undefined ? String(rank) : '+'
                      const numBg = !priSet || rank === undefined ? '#E5E5E5' : '#111'
                      const numColor = !priSet || rank === undefined ? '#aaa' : '#fff'
                      return (
                        <span key={book} style={{ display: 'inline-flex', alignItems: 'center', background: '#F5F5F5', fontSize: '0.75rem', overflow: 'hidden' }}>
                          <span style={{ background: numBg, color: numColor, padding: '0.15rem 0.35rem', fontWeight: 700, fontSize: '0.7rem', flexShrink: 0 }}>
                            {numLabel}
                          </span>
                          <span style={{ padding: '0.15rem 0.4rem' }}>{book}</span>
                          <button
                            onClick={() => handleRemoveBook(u.userId, book, u.name)}
                            title="Снять с книги"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '0.85rem', lineHeight: 1, padding: '0 0.2rem' }}
                          >
                            ×
                          </button>
                        </span>
                      )
                    })}
                  </div>
                </td>
                <td style={{ ...cell, textAlign: 'right' }}>
                  <button
                    onClick={() => handleDeleteUser(u.userId, u.name)}
                    title="Удалить пользователя"
                    style={{ background: 'none', border: '1px solid #E5E5E5', cursor: 'pointer', color: '#999', fontSize: '0.65rem', padding: '0.2rem 0.5rem', fontFamily: 'var(--nd-sans), system-ui, sans-serif', textTransform: 'uppercase', letterSpacing: '0.06em' }}
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )}
  ```

- [ ] **Step 3.4: Run lint + typecheck**

  ```bash
  npm run lint && npm run typecheck
  ```

  Expected: no errors. If there are "unused variable" warnings about `Fragment`, remove the `Fragment` import from line 3 since it's no longer needed for the users tab (still used in submissions tab — check before removing).

- [ ] **Step 3.5: Run all tests**

  ```bash
  npm test -- --no-coverage
  ```

  Expected: all tests PASS

- [ ] **Step 3.6: Commit**

  ```bash
  git add components/nd/AdminPanel.tsx
  git commit -m "feat(admin): показывать приоритеты книг в вкладке Участники, убрать фильтр по книге"
  ```

---

### Task 4: По книгам tab — add rank after participant names

**Files:**
- Modify: `components/nd/AdminPanel.tsx`

- [ ] **Step 4.1: Replace Участники column rendering in По книгам tab**

  In the По книгам tab (around line 644), find this cell:

  ```tsx
  <td style={{ ...cell, color: '#666' }}>{bookUsers.map(u => u.name).join(', ')}</td>
  ```

  Replace it with:

  ```tsx
  <td style={{ ...cell, color: '#666' }}>
    {(() => {
      const withRanks = bookUsers.map(u => {
        const pgId = emailToPgIdMap[u.userId]
        const userPriorities = pgId ? (bookPrioritiesMap[pgId] ?? []) : []
        const entry = userPriorities.find(p => p.bookName === book.name)
        return { name: u.name, rank: entry?.rank ?? null }
      })
      withRanks.sort((a, b) => {
        if (a.rank !== null && b.rank !== null) return a.rank - b.rank
        if (a.rank !== null) return -1
        if (b.rank !== null) return 1
        return 0
      })
      return withRanks.map(({ name, rank }, i) => (
        <span key={name}>
          {i > 0 && ', '}
          {name}
          {rank !== null && (
            <span style={{ fontSize: '0.65rem', color: '#aaa' }}>(#{rank})</span>
          )}
        </span>
      ))
    })()}
  </td>
  ```

  Note: this uses `bookPrioritiesMap` (the original prop) not `localPrioritiesMap` — По книгам tab is static server data and does not reflect remove-book live updates (known limitation per spec).

- [ ] **Step 4.2: Run lint + typecheck**

  ```bash
  npm run lint && npm run typecheck
  ```

  Expected: no errors

- [ ] **Step 4.3: Run all tests**

  ```bash
  npm test -- --no-coverage
  ```

  Expected: all tests PASS

- [ ] **Step 4.4: Commit**

  ```bash
  git add components/nd/AdminPanel.tsx
  git commit -m "feat(admin): показывать приоритет участника в вкладке По книгам"
  ```

- [ ] **Step 4.5: Push and verify CI**

  ```bash
  git push
  ```

  Then watch CI:
  ```bash
  gh run list --limit 3
  gh run watch
  ```

  Expected: CI green (lint + typecheck + all tests pass)
