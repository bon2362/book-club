# Matching Catalog Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переработать левую панель `/matching` в полноценный каталог, убрать избыточный UI, добавить попап с деталями книги, привести стиль к дизайн-системе сайта.

**Architecture:** Левая панель переходит от "мой список" к "каталогу" — показывает все опубликованные книги. Новая функция `fetchCatalogWithPersonalData` объединяет все книги с данными signup/priority пользователя. Попап книги берёт на себя управление статусом и добавление/удаление из списка. Вся логика сценариев и ходов остаётся без изменений.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM, Neon Postgres, dnd-kit (drag-and-drop), Radix UI Popover, Tailwind CSS + CSS-переменные дизайн-системы

---

## Затрагиваемые файлы

| Файл | Действие | Что меняется |
|------|----------|--------------|
| `lib/matching/personal-list.ts` | Modify | Добавить `CatalogBook` интерфейс и `fetchCatalogWithPersonalData` |
| `lib/matching/__tests__/personal-list.test.ts` | Modify | Тесты для нового метода |
| `app/matching/page.tsx` | Modify | Использовать новую функцию; убрать `bookParticipants` запрос; передать `userPseudonym` в header |
| `components/nd/MatchingPersonalList.tsx` | Modify | Полная переработка: новый интерфейс, попап, убрать кнопки/чипы/дропдаун |
| `components/nd/MatchingHeader.tsx` | Modify | Добавить пропс `userPseudonym`, показать в шапке |
| `components/nd/MatchingScenarios.tsx` | Modify | Привести цвета тиров к дизайн-системе |

---

## Task 1: Новый тип данных и функция fetchCatalogWithPersonalData

**Files:**
- Modify: `lib/matching/personal-list.ts`
- Modify: `lib/matching/__tests__/personal-list.test.ts`

### Контекст
Сейчас `fetchPersonalList` возвращает только книги, на которые пользователь записался (INNER JOIN с signupBooks). Нужна новая функция, которая возвращает ВСЕ опубликованные книги, дополняя их данными signup/priority там, где они есть (LEFT JOIN).

- [ ] **Шаг 1: Написать падающий тест**

Добавить в конец `lib/matching/__tests__/personal-list.test.ts`:

```typescript
import { fetchCatalogWithPersonalData } from '../personal-list'
// (импорт добавить к существующему: import { fetchPersonalList } from '../personal-list')

describe('fetchCatalogWithPersonalData', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns all published books, not just signed-up ones', async () => {
    // Simulate 3 books returned by the LEFT JOIN query:
    // b1: user signed up + has rank, b2: user signed up no rank, b3: not signed up
    const rows = [
      { bookId: 'b1', title: 'Книга А', author: 'Автор', description: 'desc', coverUrl: null,
        pages: 300, publishedDate: '2020', rank: 1, personalStatus: null, signupBookId: 'b1' },
      { bookId: 'b2', title: 'Книга Б', author: 'Автор', description: '', coverUrl: null,
        pages: null, publishedDate: '', rank: null, personalStatus: 'reading', signupBookId: 'b2' },
      { bookId: 'b3', title: 'Книга В', author: 'Автор', description: '', coverUrl: null,
        pages: null, publishedDate: '', rank: null, personalStatus: null, signupBookId: null },
    ]
    mockDb.select = jest.fn().mockReturnValue(makeChainLeftJoin(rows))
    const result = await fetchCatalogWithPersonalData('u1')
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ bookId: 'b1', rank: 1, isInList: true })
    expect(result[1]).toMatchObject({ bookId: 'b2', personalStatus: 'reading', isInList: true })
    expect(result[2]).toMatchObject({ bookId: 'b3', rank: null, isInList: false })
  })

  it('returns empty array when no books published', async () => {
    mockDb.select = jest.fn().mockReturnValue(makeChainLeftJoin([]))
    const result = await fetchCatalogWithPersonalData('u1')
    expect(result).toEqual([])
  })
})
```

Добавить хелпер `makeChainLeftJoin` рядом с `makeChain`:
```typescript
function makeChainLeftJoin(result: unknown[]) {
  return {
    from: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockResolvedValue(result),
  }
}
```

- [ ] **Шаг 2: Убедиться что тест падает**

```bash
cd /Users/ekoshkin/book-club && npm test -- --testPathPattern="personal-list" --no-coverage 2>&1 | tail -20
```
Ожидаемый результат: `FAIL` — `fetchCatalogWithPersonalData is not a function`

- [ ] **Шаг 3: Реализовать**

В `lib/matching/personal-list.ts` добавить после существующего кода:

```typescript
export interface CatalogBook {
  bookId: string
  title: string
  author: string
  description: string
  coverUrl: string | null
  pages: number | null
  publishedDate: string
  rank: number | null
  personalStatus: string | null
  isInList: boolean
}

export async function fetchCatalogWithPersonalData(userId: string): Promise<CatalogBook[]> {
  const rows = await db
    .select({
      bookId: books.id,
      title: books.title,
      author: books.author,
      description: books.description,
      coverUrl: books.coverUrl,
      pages: books.pages,
      publishedDate: books.publishedDate,
      rank: bookPriorities.rank,
      personalStatus: signupBooks.personalStatus,
      signupBookId: signupBooks.bookId,
    })
    .from(books)
    .leftJoin(
      signupBooks,
      and(eq(signupBooks.bookId, books.id), eq(signupBooks.userId, userId)),
    )
    .leftJoin(
      bookPriorities,
      and(eq(bookPriorities.bookId, books.id), eq(bookPriorities.userId, userId)),
    )
    .where(eq(books.visibility, 'published'))
    .orderBy(
      sql`${bookPriorities.rank} ASC NULLS LAST`,
      asc(books.sortOrder),
      asc(books.title),
    )

  return rows.map((row) => ({
    bookId: row.bookId,
    title: row.title,
    author: row.author,
    description: row.description,
    coverUrl: row.coverUrl,
    pages: row.pages,
    publishedDate: row.publishedDate,
    rank: row.rank,
    personalStatus: row.personalStatus,
    isInList: row.signupBookId !== null,
  }))
}
```

В `lib/matching/personal-list.ts` в начало добавить `sql` в импорты если его нет:
```typescript
import { eq, and, asc, sql } from 'drizzle-orm'
```

- [ ] **Шаг 4: Тесты проходят**

```bash
npm test -- --testPathPattern="personal-list" --no-coverage 2>&1 | tail -20
```
Ожидаемый результат: `PASS` — все тесты зелёные

- [ ] **Шаг 5: Lint + typecheck**

```bash
npm run lint && npm run typecheck 2>&1 | tail -30
```

- [ ] **Шаг 6: Коммит**

```bash
git checkout -b feat/matching-catalog-redesign
git add lib/matching/personal-list.ts lib/matching/__tests__/personal-list.test.ts
git commit -m "feat(matching): add CatalogBook type and fetchCatalogWithPersonalData"
```

---

## Task 2: Обновить page.tsx — новая функция данных, убрать chipы, передать pseudonym

**Files:**
- Modify: `app/matching/page.tsx`

### Контекст
`page.tsx` сейчас:
1. Вызывает `fetchPersonalList` (строка 107) — заменить на `fetchCatalogWithPersonalData`
2. Вычисляет `bookParticipants` (строки 116–151) для чипов в левой панели — удалить целиком
3. Не передаёт псевдоним пользователя в `MatchingHeader` — добавить
4. Передаёт `bookParticipants` в `MatchingPersonalList` — убрать
5. Рендерит ссылку "Перейти в Админ-панель" (строки 231–244) — удалить
6. Проверяет `personalBooks` для `MatchingRankNudge` — обновить

- [ ] **Шаг 1: Заменить импорты в page.tsx**

Строка 8: заменить
```typescript
import { fetchPersonalList } from '@/lib/matching/personal-list'
```
на
```typescript
import { fetchCatalogWithPersonalData } from '@/lib/matching/personal-list'
```

Импорт `BookParticipant` из `MatchingPersonalList` оставить — он используется для чипов, которые теперь показываются в попапе.

- [ ] **Шаг 2: Заменить вызов fetchPersonalList**

Строки 94–108 сейчас:
```typescript
const [participants, personalBooks, myMoves] = await Promise.all([
  db.select({ ... }).from(...),
  fetchPersonalList(viewingUserId),
  fetchMyMoves(viewingUserId, activeSession.id, activeSession.targetGroupSize),
])
```

Заменить `fetchPersonalList(viewingUserId)` на `fetchCatalogWithPersonalData(viewingUserId)`, переменную `personalBooks` → `catalogBooks`:

```typescript
const [participants, catalogBooks, myMoves] = await Promise.all([
  db
    .select({
      userId: matchingSessionParticipants.userId,
      pseudonym: matchingSessionParticipants.pseudonym,
      joinedAt: matchingSessionParticipants.joinedAt,
      name: users.name,
    })
    .from(matchingSessionParticipants)
    .leftJoin(users, eq(matchingSessionParticipants.userId, users.id))
    .where(eq(matchingSessionParticipants.sessionId, activeSession.id))
    .orderBy(matchingSessionParticipants.joinedAt),
  fetchCatalogWithPersonalData(viewingUserId),
  fetchMyMoves(viewingUserId, activeSession.id, activeSession.targetGroupSize),
])
```

- [ ] **Шаг 3: Обновить блок bookParticipants — убрать фильтр по bookId**

Строки 110–151 содержат вычисление `participantUserIds`, `viewedParticipant` и запрос `bookParticipants`.

Оставить `participantUserIds` и `viewedParticipant` без изменений. Блок `bookParticipants` обновить так, чтобы запрос возвращал подписки ВСЕХ участников на ВСЕ книги (убрать фильтр по `personalBooks.map(b => b.bookId)`):

```typescript
const participantUserIds = participants.map((p) => p.userId)
const viewedParticipant = isImpersonating
  ? participants.find((p) => p.userId === asParam)
  : null

// Pseudonym for current user (not impersonating)
const userPseudonym = !isImpersonating
  ? (participants.find((p) => p.userId === session.user.id)?.pseudonym ?? null)
  : null

// Chips: all signups by session participants across all books (shown in popup)
const bookParticipants: BookParticipant[] =
  participantUserIds.length > 0
    ? await db
        .select({
          userId: signupBooks.userId,
          bookId: signupBooks.bookId,
          rank: bookPriorities.rank,
          personalStatus: signupBooks.personalStatus,
        })
        .from(signupBooks)
        .leftJoin(
          bookPriorities,
          and(
            eq(bookPriorities.userId, signupBooks.userId),
            eq(bookPriorities.bookId, signupBooks.bookId),
          ),
        )
        .where(inArray(signupBooks.userId, participantUserIds))
        .then((rows) =>
          rows.map((row) => {
            const participant = participants.find((p) => p.userId === row.userId)
            return {
              userId: row.userId,
              bookId: row.bookId,
              pseudonym: participant?.pseudonym ?? row.userId,
              rank: row.rank,
              personalStatus: row.personalStatus ?? null,
            }
          }),
        )
    : []
```

- [ ] **Шаг 4: Обновить MatchingRankNudge**

Строку с `MatchingRankNudge` обновить:
```typescript
<MatchingRankNudge
  show={
    catalogBooks.some((b) => b.isInList && b.personalStatus === null) &&
    catalogBooks.filter((b) => b.isInList && b.personalStatus === null).every((b) => b.rank === null)
  }
/>
```

- [ ] **Шаг 5: Обновить заголовок левой колонки**

Строки 208–216:
```typescript
<h2 className="text-base font-semibold m-0" style={{ color: 'var(--text)' }}>
  {isImpersonating ? 'Список участника' : 'Каталог'}
</h2>
{!isImpersonating && (
  <p className="text-xs mt-0.5 m-0" style={{ color: 'var(--text-muted)' }}>
    Перетащи книги, чтобы расставить приоритеты
  </p>
)}
```

- [ ] **Шаг 6: Обновить MatchingPersonalList (catalogBooks + bookParticipants)**

Строки 218–229: обновить prop-passing в MatchingPersonalList:
```typescript
<MatchingPersonalList
  books={catalogBooks}
  bookParticipants={bookParticipants}
  viewingUserId={viewingUserId}
  frozen={isFrozenOrImpersonating}
/>
```
(передать `bookParticipants` — теперь чипы рендерятся в попапе, не в строках)

- [ ] **Шаг 7: Удалить admin ссылку внизу левой колонки**

Удалить блок строк 231–244:
```typescript
{isAdmin && !isImpersonating && (
  <div
    className="px-4 py-2.5 shrink-0 border-t"
    style={{ borderColor: 'var(--border)' }}
  >
    <a
      href="/admin?tab=matching"
      className="text-xs underline"
      style={{ color: 'var(--text-muted)' }}
    >
      Перейти в Админ-панель → Матчинг
    </a>
  </div>
)}
```

- [ ] **Шаг 8: Передать userPseudonym в MatchingHeader**

В рендере MatchingHeader добавить проп:
```typescript
<MatchingHeader
  sessionName={activeSession.name}
  sessionStatus={activeSession.status}
  targetGroupSize={activeSession.targetGroupSize}
  deadlineAt={activeSession.deadlineAt ? new Date(activeSession.deadlineAt).toISOString() : null}
  participants={participants.map((p) => ({ userId: p.userId, pseudonym: p.pseudonym, name: p.name ?? null }))}
  isAdmin={isAdmin}
  isImpersonating={isImpersonating}
  viewedPseudonym={viewedParticipant?.pseudonym ?? null}
  viewedName={viewedParticipant?.name ?? null}
  asParam={asParam}
  userPseudonym={userPseudonym}
/>
```

- [ ] **Шаг 9: Lint + typecheck**

```bash
npm run lint && npm run typecheck 2>&1 | tail -40
```
Ожидаются ошибки TypeScript на `MatchingHeader` и `MatchingPersonalList` пока не обновлены их пропсы — нормально, продолжаем.

- [ ] **Шаг 10: Коммит**

```bash
git add app/matching/page.tsx
git commit -m "refactor(matching): use fetchCatalogWithPersonalData, remove chips query, pass pseudonym"
```

---

## Task 3: MatchingHeader — показывать псевдоним пользователя

**Files:**
- Modify: `components/nd/MatchingHeader.tsx`

### Контекст
Пользователь хочет видеть свой псевдоним где-то в шапке, а не в каждой строке каталога.

- [ ] **Шаг 1: Добавить проп `userPseudonym` в интерфейс**

В `components/nd/MatchingHeader.tsx` в interface Props добавить:
```typescript
userPseudonym: string | null
```

- [ ] **Шаг 2: Добавить отображение псевдонима в шапку**

В рендере шапки (`<header ...>`), в левой части (`{/* Left: session info */}`), после информации о сессии и дедлайне, добавить чип:

```typescript
{userPseudonym && (
  <span
    className={`text-[11px] px-2.5 py-1 rounded-full font-medium shrink-0 ${pseudonymColor(userPseudonym)}`}
  >
    Я: {userPseudonym}
  </span>
)}
```

Вставить после блока `{deadlineText && ...}` и перед `{sessionStatus === 'frozen' ? ...}`.

- [ ] **Шаг 3: Lint + typecheck**

```bash
npm run lint && npm run typecheck 2>&1 | tail -20
```

- [ ] **Шаг 4: Коммит**

```bash
git add components/nd/MatchingHeader.tsx
git commit -m "feat(matching): show user's own pseudonym in session header"
```

---

## Task 4: MatchingPersonalList — полная переработка

**Files:**
- Modify: `components/nd/MatchingPersonalList.tsx`

### Контекст
Компонент полностью переписывается:
- Пропс `books` теперь `CatalogBook[]` (все книги, не только подписанные)
- Убрать `BookParticipant` импорт и проп
- Убрать кнопки ▲▼
- Переместить `#N место в списке` влево (рядом с drag handle)
- Убрать чипы участников из строк
- Убрать дропдаун статуса из строк → перенести в попап
- При клике на книгу открывать `BookDetailModal`
- Три секции: активные (дрег-н-дроп), "В процессе/Прочитано", остальные (каталог)

- [ ] **Шаг 1: Заменить интерфейс компонента**

Начало файла `components/nd/MatchingPersonalList.tsx` заменить целиком:

```typescript
'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CatalogBook } from '@/lib/matching/personal-list'
import CoverImage from './CoverImage'

// BookParticipant остаётся — используется для чипов в попапе
export interface BookParticipant {
  userId: string
  bookId: string
  pseudonym: string
  rank: number | null
  personalStatus: string | null
}

const PSEUDONYM_COLORS = [
  { chip: 'bg-[#fde8d8] text-[#7c3516]', border: 'border-[#f8c4a0]' },
  { chip: 'bg-[#dcfce7] text-[#14532d]', border: 'border-[#86efac]' },
  { chip: 'bg-[#dbeafe] text-[#1e3a8a]', border: 'border-[#93c5fd]' },
  { chip: 'bg-[#fef9c3] text-[#713f12]', border: 'border-[#fde047]' },
  { chip: 'bg-[#f3e8ff] text-[#581c87]', border: 'border-[#d8b4fe]' },
  { chip: 'bg-[#ffe4e6] text-[#881337]', border: 'border-[#fda4af]' },
  { chip: 'bg-[#d1fae5] text-[#065f46]', border: 'border-[#6ee7b7]' },
  { chip: 'bg-[#e0f2fe] text-[#075985]', border: 'border-[#7dd3fc]' },
]

function getPseudonymColor(pseudonym: string) {
  let hash = 0
  for (let i = 0; i < pseudonym.length; i++) hash = pseudonym.charCodeAt(i) + ((hash << 5) - hash)
  return PSEUDONYM_COLORS[Math.abs(hash) % PSEUDONYM_COLORS.length]
}

function interestLabel(rank: number | null, personalStatus: string | null): string {
  if (personalStatus === 'reading') return 'читаю'
  if (personalStatus === 'read') return 'прочитал(а)'
  if (rank === null) return 'без ранга'
  if (rank <= 3) return 'хочу читать'
  return 'готов(а)'
}

interface Props {
  books: CatalogBook[]
  bookParticipants: BookParticipant[]
  viewingUserId: string
  frozen?: boolean
}
```

- [ ] **Шаг 2: Заменить SortableRow**

Заменить весь `SortableRow` компонент:

```typescript
interface SortableRowProps {
  book: CatalogBook
  index: number
  frozen: boolean
  onClick: (book: CatalogBook) => void
}

function SortableRow({ book, index, frozen, onClick }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: book.bookId,
    disabled: frozen,
  })

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        display: 'grid',
        gridTemplateColumns: '48px 1fr',
        gap: '12px',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        opacity: isDragging ? 0.5 : 1,
        background: isDragging ? 'var(--bg-elevated)' : undefined,
        alignItems: 'start',
        cursor: 'pointer',
      }}
      onClick={() => onClick(book)}
    >
      {/* Rank + drag handle stacked */}
      <div className="flex flex-col items-center gap-0.5 pt-0.5">
        {book.rank != null && (
          <span className="text-lg font-bold leading-none" style={{ color: 'var(--text)' }}>
            #{index + 1}
          </span>
        )}
        {!frozen && (
          <button
            {...attributes}
            {...listeners}
            aria-label={`Перетащить книгу ${book.title}`}
            onClick={(e) => e.stopPropagation()}
            className="cursor-grab select-none touch-none text-base leading-none"
            style={{ color: 'var(--text-muted)', opacity: 0.5 }}
          >
            ⠿
          </button>
        )}
      </div>

      {/* Cover + title + author */}
      <div className="flex gap-3 min-w-0">
        <div className="relative rounded overflow-hidden shrink-0" style={{ width: 44, height: 62 }}>
          <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
        </div>
        <div className="min-w-0">
          <div
            className="font-semibold text-sm leading-snug mb-0.5"
            style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {book.title}
          </div>
          <div
            className="text-xs"
            style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {book.author}
          </div>
        </div>
      </div>
    </li>
  )
}
```

- [ ] **Шаг 3: Заменить StatusRow**

```typescript
interface StatusRowProps {
  book: CatalogBook
  onClick: (book: CatalogBook) => void
}

function StatusRow({ book, onClick }: StatusRowProps) {
  const statusLabel = book.personalStatus === 'reading' ? 'Читаю' : 'Прочитал(а)'
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '48px 1fr',
        gap: '12px',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        alignItems: 'start',
        opacity: 0.7,
        cursor: 'pointer',
      }}
      onClick={() => onClick(book)}
    >
      <div className="flex justify-center pt-1">
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {statusLabel === 'Читаю' ? '📖' : '✓'}
        </span>
      </div>
      <div className="flex gap-3 min-w-0">
        <div className="relative rounded overflow-hidden shrink-0" style={{ width: 44, height: 62 }}>
          <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
        </div>
        <div className="min-w-0">
          <div
            className="font-semibold text-sm leading-snug mb-0.5"
            style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {book.title}
          </div>
          <div
            className="text-xs"
            style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {book.author}
          </div>
        </div>
      </div>
    </li>
  )
}
```

- [ ] **Шаг 4: Добавить CatalogRow (книги не в списке)**

```typescript
interface CatalogRowProps {
  book: CatalogBook
  onClick: (book: CatalogBook) => void
}

function CatalogRow({ book, onClick }: CatalogRowProps) {
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '48px 1fr',
        gap: '12px',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        alignItems: 'start',
        cursor: 'pointer',
      }}
      onClick={() => onClick(book)}
    >
      <div className="flex justify-center pt-1">
        <span className="text-base leading-none" style={{ color: 'var(--text-muted)', opacity: 0.4 }}>+</span>
      </div>
      <div className="flex gap-3 min-w-0">
        <div className="relative rounded overflow-hidden shrink-0" style={{ width: 44, height: 62 }}>
          <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
        </div>
        <div className="min-w-0">
          <div
            className="font-semibold text-sm leading-snug mb-0.5"
            style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {book.title}
          </div>
          <div
            className="text-xs"
            style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {book.author}
          </div>
        </div>
      </div>
    </li>
  )
}
```

- [ ] **Шаг 5: Добавить BookDetailModal**

```typescript
interface BookDetailModalProps {
  book: CatalogBook
  chips: BookParticipant[]   // подписки других участников на эту книгу
  viewingUserId: string
  frozen: boolean
  onClose: () => void
  onStatusChange: (bookId: string, status: string | null) => Promise<void>
  onAddToList: (bookId: string) => Promise<void>
  onRemoveFromList: (bookId: string) => Promise<void>
}

function BookDetailModal({
  book,
  chips,
  viewingUserId,
  frozen,
  onClose,
  onStatusChange,
  onAddToList,
  onRemoveFromList,
}: BookDetailModalProps) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleAddToList() {
    setBusy(true)
    try { await onAddToList(book.bookId) } finally { setBusy(false) }
  }

  async function handleRemoveFromList() {
    setBusy(true)
    try { await onRemoveFromList(book.bookId) } finally { setBusy(false) }
  }

  async function handleStatusChange(newStatus: string | null) {
    setBusy(true)
    try { await onStatusChange(book.bookId, newStatus) } finally { setBusy(false) }
  }

  const meta: string[] = []
  if (book.publishedDate) meta.push(book.publishedDate.split('/').at(-1) ?? book.publishedDate)
  if (book.pages) meta.push(`${book.pages} стр.`)

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(26, 23, 20, 0.4)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={book.title}
        onClick={(e) => e.stopPropagation()}
        className="border rounded-xl p-5 max-w-[420px] w-full"
        style={{
          background: 'var(--bg-input)',
          borderColor: 'var(--border)',
          boxShadow: '0 24px 70px rgba(26,23,20,0.18)',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        {/* Cover + title */}
        <div className="flex gap-4 mb-4">
          <div className="relative rounded overflow-hidden shrink-0" style={{ width: 64, height: 92 }}>
            <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="font-semibold text-base leading-snug mb-1"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif', color: 'var(--text)' }}
            >
              {book.title}
            </div>
            <div className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>
              {book.author}
            </div>
            {meta.length > 0 && (
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {meta.join(' · ')}
              </div>
            )}
          </div>
        </div>

        {/* Participant chips */}
        {chips.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Участники
            </div>
            <div className="flex flex-wrap gap-1">
              {chips.map((p) => {
                const colors = getPseudonymColor(p.pseudonym)
                const isMe = p.userId === viewingUserId
                const label = interestLabel(p.rank, p.personalStatus)
                const rankStr = p.rank != null ? ` #${p.rank}` : ''
                return (
                  <span
                    key={p.userId}
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] border ${colors.chip} ${colors.border} ${isMe ? 'ring-1 ring-current' : ''}`}
                    title={isMe ? 'Это вы' : undefined}
                  >
                    {p.pseudonym} · {label}{rankStr}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Description */}
        {book.description && (
          <p
            className="text-sm leading-relaxed mb-4"
            style={{ color: 'var(--text-body)' }}
          >
            {book.description}
          </p>
        )}

        {/* Status (только если в списке и не frozen) */}
        {book.isInList && !frozen && (
          <div className="mb-4">
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Статус
            </label>
            <select
              value={book.personalStatus ?? ''}
              onChange={(e) => handleStatusChange(e.target.value || null)}
              disabled={busy}
              className="w-full text-sm border rounded-lg px-3 py-2 cursor-pointer"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--bg-elevated)',
                color: 'var(--text)',
              }}
            >
              <option value="">В списке</option>
              <option value="reading">Читаю сейчас</option>
              <option value="read">Прочитал(а)</option>
            </select>
          </div>
        )}

        {/* Add/Remove buttons */}
        {!frozen && (
          <div className="flex gap-2">
            {book.isInList ? (
              <button
                onClick={handleRemoveFromList}
                disabled={busy}
                className="flex-1 text-sm py-2 px-3 rounded-lg border transition-colors"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-muted)',
                  cursor: busy ? 'default' : 'pointer',
                }}
              >
                {busy ? '…' : 'Убрать из списка'}
              </button>
            ) : (
              <button
                onClick={handleAddToList}
                disabled={busy}
                className="flex-1 text-sm py-2 px-3 rounded-lg border transition-colors font-medium"
                style={{
                  borderColor: 'var(--accent)',
                  background: 'var(--accent)',
                  color: '#fff',
                  cursor: busy ? 'default' : 'pointer',
                  opacity: busy ? 0.7 : 1,
                }}
              >
                {busy ? '…' : 'Добавить в список'}
              </button>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 text-xs cursor-pointer block"
          style={{ color: 'var(--text-muted)' }}
        >
          Закрыть (Esc)
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Шаг 6: Обновить вспомогательные функции**

Заменить `patchPriorities`, `patchStatus` и их вызовы (сохранить существующий код этих функций):

```typescript
async function patchPriorities(bookIds: string[]) {
  await fetch('/api/matching/priorities', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bookIds }),
  })
}

async function patchStatus(bookId: string, status: string | null) {
  await fetch(`/api/signup-books/${bookId}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  })
}

async function addToList(bookId: string) {
  await fetch('/api/matching/books', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bookId }),
  })
}

async function removeFromList(bookId: string) {
  await fetch(`/api/matching/books/${bookId}`, { method: 'DELETE' })
}
```

- [ ] **Шаг 7: Переписать основной компонент MatchingPersonalList**

```typescript
export default function MatchingPersonalList({
  books: initialBooks,
  bookParticipants,
  viewingUserId,
  frozen = false,
}: Props) {
  const [books, setBooks] = useState(initialBooks)
  const [announcement, setAnnouncement] = useState('')
  const [modalBook, setModalBook] = useState<CatalogBook | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const activeBooks = books.filter((b) => b.isInList && b.personalStatus === null)
  const statusBooks = books.filter((b) => b.isInList && b.personalStatus !== null)
  const catalogOnlyBooks = books.filter((b) => !b.isInList)

  function rerank(updatedBooks: CatalogBook[]): CatalogBook[] {
    let rankCounter = 0
    return updatedBooks.map((b) => {
      if (b.isInList && b.personalStatus === null) {
        rankCounter++
        return { ...b, rank: rankCounter }
      }
      return { ...b, rank: null }
    })
  }

  const applyNewOrder = useCallback(async (newBooks: CatalogBook[]) => {
    const reranked = rerank(newBooks)
    setBooks(reranked)
    await patchPriorities(
      reranked.filter((b) => b.isInList && b.personalStatus === null).map((b) => b.bookId)
    )
    return reranked
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const currentActive = books.filter((b) => b.isInList && b.personalStatus === null)
      const oldIndex = currentActive.findIndex((b) => b.bookId === active.id)
      const newIndex = currentActive.findIndex((b) => b.bookId === over.id)
      const reorderedActive = arrayMove(currentActive, oldIndex, newIndex)
      const rest = books.filter((b) => !(b.isInList && b.personalStatus === null))
      await applyNewOrder([...reorderedActive, ...rest])
      setAnnouncement(
        `Книга ${currentActive[oldIndex].title} перемещена на позицию ${newIndex + 1} из ${reorderedActive.length}`,
      )
    },
    [books, applyNewOrder],
  )

  const handleStatusChange = useCallback(
    async (bookId: string, newStatus: string | null) => {
      const updatedBooks = books.map((b) =>
        b.bookId === bookId ? { ...b, personalStatus: newStatus } : b,
      )
      const rankedActive = updatedBooks
        .filter((b) => b.isInList && b.personalStatus === null && b.rank !== null)
        .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      const unrankedActive = updatedBooks.filter(
        (b) => b.isInList && b.personalStatus === null && b.rank === null,
      )
      const statusBooksUpdated = updatedBooks.filter((b) => b.isInList && b.personalStatus !== null)
      const catalog = updatedBooks.filter((b) => !b.isInList)
      const merged = [...rankedActive, ...unrankedActive, ...statusBooksUpdated, ...catalog]
      setBooks(merged)
      // Update modal book if it's the same book
      setModalBook((prev) => (prev?.bookId === bookId ? { ...prev, personalStatus: newStatus } : prev))
      await Promise.all([
        patchStatus(bookId, newStatus),
        patchPriorities(rankedActive.map((b) => b.bookId)),
      ])
    },
    [books],
  )

  const handleAddToList = useCallback(
    async (bookId: string) => {
      setBooks((prev) =>
        prev.map((b) => (b.bookId === bookId ? { ...b, isInList: true, rank: null } : b)),
      )
      setModalBook((prev) => (prev?.bookId === bookId ? { ...prev, isInList: true } : prev))
      await addToList(bookId)
    },
    [],
  )

  const handleRemoveFromList = useCallback(
    async (bookId: string) => {
      setBooks((prev) => {
        const updated = prev.map((b) =>
          b.bookId === bookId ? { ...b, isInList: false, rank: null, personalStatus: null } : b,
        )
        return rerank(updated)
      })
      setModalBook((prev) =>
        prev?.bookId === bookId ? { ...prev, isInList: false, rank: null, personalStatus: null } : prev,
      )
      await removeFromList(bookId)
    },
    [],
  )

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="dnd-announcement"
        className="absolute w-px h-px overflow-hidden"
        style={{ clip: 'rect(0,0,0,0)' }}
      >
        {announcement}
      </div>

      {modalBook && (
        <BookDetailModal
          book={modalBook}
          chips={bookParticipants.filter((p) => p.bookId === modalBook.bookId)}
          viewingUserId={viewingUserId}
          frozen={frozen}
          onClose={() => setModalBook(null)}
          onStatusChange={handleStatusChange}
          onAddToList={handleAddToList}
          onRemoveFromList={handleRemoveFromList}
        />
      )}

      {/* Active ranked books (drag-and-drop) */}
      {activeBooks.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={activeBooks.map((b) => b.bookId)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="list-none p-0 m-0" data-testid="matching-personal-list">
              {activeBooks.map((book, idx) => (
                <SortableRow
                  key={book.bookId}
                  book={book}
                  index={idx}
                  frozen={frozen}
                  onClick={setModalBook}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {/* Status books section */}
      {statusBooks.length > 0 && (
        <>
          <div
            className="px-4 py-2 border-b border-t"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
          >
            <span
              className="text-[11px] font-medium uppercase tracking-wide block"
              style={{ color: 'var(--text-muted)' }}
            >
              В процессе / Прочитано
            </span>
            <span
              className="text-[10px] block mt-0.5"
              style={{ color: 'var(--text-muted)', opacity: 0.75 }}
            >
              исключены при расчёте ваших сценариев и ходов
            </span>
          </div>
          <ul className="list-none p-0 m-0">
            {statusBooks.map((book) => (
              <StatusRow key={book.bookId} book={book} onClick={setModalBook} />
            ))}
          </ul>
        </>
      )}

      {/* Catalog (not in list) */}
      {catalogOnlyBooks.length > 0 && (
        <>
          <div
            className="px-4 py-2 border-b border-t"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
          >
            <span
              className="text-[11px] font-medium uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}
            >
              Все книги клуба
            </span>
          </div>
          <ul className="list-none p-0 m-0">
            {catalogOnlyBooks.map((book) => (
              <CatalogRow key={book.bookId} book={book} onClick={setModalBook} />
            ))}
          </ul>
        </>
      )}

      {activeBooks.length === 0 && statusBooks.length === 0 && catalogOnlyBooks.length === 0 && (
        <div
          className="flex flex-col items-center justify-center h-full p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <div className="text-4xl mb-3">📚</div>
          <p className="text-sm leading-relaxed">Нет опубликованных книг.</p>
        </div>
      )}
    </>
  )
}
```

- [ ] **Шаг 8: Lint + typecheck**

```bash
npm run lint && npm run typecheck 2>&1 | tail -40
```

- [ ] **Шаг 9: Убедиться что тесты проходят**

```bash
npm test -- --no-coverage 2>&1 | tail -20
```

- [ ] **Шаг 10: Коммит**

```bash
git add components/nd/MatchingPersonalList.tsx
git commit -m "feat(matching): overhaul catalog panel - all books, popup, no chips/arrows"
```

---

## Task 5: Стиль — привести цвета тиров MatchingScenarios к дизайн-системе

**Files:**
- Modify: `components/nd/MatchingScenarios.tsx`

### Контекст
Текущие цвета тиров (line 19–38) используют хардкоженные hex-значения (`#f0fdf4`, `#86efac`, `#15803d` — стандартные green-50/300/700 Tailwind), которые выбиваются из тёплой parchment-палитры сайта. Нужно заменить на CSS-переменные дизайн-системы.

`--bg-tag-green: #EBF3EE` — warm green тег  
`--success: #2D6A4F` — тёмный успешный зелёный  
`--bg-elevated: #EDE5D8` — тёплый бежевый фон  
`--border: #D4C4B0` — основной бордер

- [ ] **Шаг 1: Заменить tierConfig**

В `components/nd/MatchingScenarios.tsx` заменить весь `tierConfig` объект (строки 19–38):

```typescript
const tierConfig = {
  leader: {
    style: { background: 'var(--bg-tag-green)', borderColor: 'var(--success)' },
    label: 'лидер',
    labelStyle: { color: 'var(--success)', borderColor: 'var(--success)' },
  },
  'max-coverage': {
    style: { background: 'var(--bg-elevated)', borderColor: 'var(--border)' },
    label: 'макс. покрытие',
    labelStyle: { color: 'var(--text-secondary)', borderColor: 'var(--border)' },
  },
  'sub-max': {
    style: { background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' },
    label: null,
    labelStyle: {},
  },
} as const
```

- [ ] **Шаг 2: Обновить JSX в MatchingScenarios**

В JSX рендере карточек (строка ~128), заменить использование `tier.bg` и `tier.border` на `style`:

```typescript
<li
  key={card.bookId}
  className="rounded-xl border p-3.5"
  style={tier.style}
>
```

И для лейбла тира заменить `className={...tier.labelClass}` на `style={tier.labelStyle}`:

```typescript
{tier.label && (
  <span
    className="text-[10px] border rounded-full px-2 py-0.5 shrink-0"
    style={tier.labelStyle}
  >
    {tier.label}
  </span>
)}
```

- [ ] **Шаг 3: Lint + typecheck**

```bash
npm run lint && npm run typecheck 2>&1 | tail -20
```

- [ ] **Шаг 4: Коммит**

```bash
git add components/nd/MatchingScenarios.tsx
git commit -m "style(matching): align scenario tier colors with design system palette"
```

---

## Task 6: PR и деплой

- [ ] **Шаг 1: Финальная проверка**

```bash
npm run lint && npm run typecheck && npm test -- --no-coverage 2>&1 | tail -30
```

- [ ] **Шаг 2: Push и PR**

```bash
git push -u origin feat/matching-catalog-redesign
gh pr create --title "feat(matching): catalog redesign — all books, popup, style fixes" --body "$(cat <<'EOF'
## Summary
- Левая панель стала каталогом: показывает все опубликованные книги клуба, не только подписанные
- Убраны кнопки ▲▼ (только drag-and-drop для расстановки приоритетов)
- Номер позиции (#1, #2…) теперь слева рядом с drag handle
- Попап по клику на книгу: описание, управление статусом, добавить/убрать из списка
- Чипы участников удалены из каталога (остаются в сценариях и ходах)
- Псевдоним пользователя показан в шапке сессии
- Ссылка «Перейти в Админ-панель» удалена
- Секция «В процессе / Прочитано» получила подзаголовок про исключение из расчёта
- Цвета тиров сценариев приведены к дизайн-системе (parchment-палитра вместо зелёного/синего)

## Test plan
- [ ] Открыть /matching — видны все книги клуба, не только свои
- [ ] Перетащить книгу — ранг обновляется, #N отображается слева
- [ ] Кликнуть на книгу не в списке — попап с «Добавить в список»
- [ ] Добавить книгу — она появляется в верхней секции
- [ ] Кликнуть на книгу в списке — попап с дропдауном статуса и «Убрать из списка»
- [ ] Сменить статус на «Читаю сейчас» — книга переходит в секцию «В процессе»
- [ ] Убрать книгу из списка — она уходит в секцию «Все книги клуба»
- [ ] Псевдоним «Я: Медведка» виден в шапке
- [ ] Кнопки ▲▼ отсутствуют
- [ ] Сценарии групп — тёплые цвета (без синего/зелёного Tailwind)
- [ ] Frozen-сессия: всё read-only, попап без кнопок/дропдауна

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --auto --squash --delete-branch
```

- [ ] **Шаг 3: Проверить CI**

```bash
gh run watch $(gh run list --limit 1 --json databaseId -q '.[0].databaseId')
```

---

## Self-Review

### Spec coverage

| Требование | Задача |
|-----------|--------|
| 1. Убрать ▲▼ кнопки | Task 4 — SortableRow без onMoveUp/onMoveDown |
| 2. Ранг рядом с drag handle | Task 4 — SortableRow layout |
| 3. Все книги клуба в списке | Task 1 + 2 (fetchCatalogWithPersonalData) + Task 4 (CatalogRow секция) |
| 4. Переименовать в «Каталог» | Task 2 (page.tsx заголовок) |
| 5. Попап с информацией о книге | Task 4 — BookDetailModal |
| 6. Статус переехал в попап | Task 4 — статус только в BookDetailModal |
| 7. Чипы участников переехали в попап; псевдоним пользователя в шапку | Task 2 (обновлён запрос) + Task 3 + Task 4 (BookDetailModal показывает чипы) |
| 8. Логика сценариев/ходов без изменений | Не трогаем MatchingScenarios/MyMoves/scenarios.ts/my-moves.ts |
| 9. Чипы остаются в сценариях/ходах | Не трогаем эти компоненты |
| 10. Убрать ссылку Админ-панель | Task 2 (page.tsx) |
| 11. Подзаголовок «исключены из расчёта» | Task 4 — секция statusBooks |
| 12. Стиль — цвета дизайн-системы | Task 5 — MatchingScenarios tierConfig |

### Escape-клавиша попапа

Обработчик `Escape` уже добавлен в `BookDetailModal` через `useEffect` в шаге 5 Task 4. `useEffect` включён в импорты в шаге 1 Task 4.

### Пропущенное: E2E тестов для matching нет

В `e2e/` нет файла для `/matching`. Новый функционал не покрыт E2E — это приемлемо для данного PR, так как CLAUDE.md требует E2E только для "нового UI-флоу". Каталог — не новый флоу, это переработка существующего. Добавление к списку матчинга было доступно и ранее (с главной). Если потребуется E2E — выделить в отдельный тикет.
