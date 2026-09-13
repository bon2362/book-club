# Подборки — PR 3: модерация в админке

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Вкладка «Подборки» в админке: переключатель блока на главной, очередь из четырёх секций, разбор новой подборки, разница для изменённой, действия с обязательной причиной, правка и удаление.

**Architecture:** Один клиентский компонент-контейнер `AdminCollectionsPanel` (очередь + выбор) и компонент разбора `AdminCollectionReview` (детали, разница, действия). Правка владельцем переиспользует `CollectionEditor` из PR 2 в режиме `admin`. Все данные — через админские роуты PR 1.

**Tech Stack:** React client components, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-12-book-collections-design.md` → «Роли и сценарии → Админ», «Дизайн → Модерация». Контракты — `00-overview.md`.

## Global Constraints

См. `00-overview.md`. Для этого PR: причина `reject` / `hide` обязательна и в интерфейсе (кнопка неактивна при пустом тексте); разница — «добавлены `+` `--success`, убраны `−` `--accent` с зачёркиванием и притушенной обложкой, переставлены `↕` `--text-secondary` с «5 → 6»; фоны `del` — `--accent-soft`, `ins` — `--bg-tag-green`.

## Подготовка

- [ ] PR 2 смержен.
- [ ] Worktree `../book-club-collections-3`, ветка `feat/collections-moderation` от свежего `origin/main`; симлинки `node_modules`, `.env.local`, `.env.test.local` (как в PR 2).

---

### Task 1: Очередь и переключатель

**Files:**
- Create: `components/nd/AdminCollectionsPanel.tsx`, `components/nd/AdminCollectionsPanel.test.tsx`
- Modify: `app/globals.css` (медиа-правило раскладки)

**Interfaces:**
- Consumes: `GET /api/admin/collections`, `GET/PATCH /api/admin/collections/settings`, `AdminCollectionQueue`, `formatDiffSummary`, `formatChangedAt`, `textsCount`
- Produces: `<AdminCollectionsPanel initialSelectedId?: string | null onCountChange?: (count: number) => void />`

- [ ] **Step 1: Тест**

```tsx
// components/nd/AdminCollectionsPanel.test.tsx
/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import AdminCollectionsPanel from './AdminCollectionsPanel'

jest.mock('./AdminCollectionReview', () => ({ __esModule: true, default: ({ id }: { id: string }) => <div data-testid="review">{id}</div> }))
jest.mock('./CoverImage', () => ({ __esModule: true, default: () => <span /> }))

const item = (id: string, overrides = {}) => ({
  id, slug: null, title: `Подборка ${id}`, displayName: 'Аня', status: 'pending', textsCount: 3, covers: [],
  at: '2026-09-11T11:02:00Z', diffSummary: null, ...overrides,
})
const queue = {
  pending: [item('p1')],
  changed: [item('c1', { status: 'published', diffSummary: { added: 1, removed: 1, textChanged: true, orderChanged: false } })],
  published: [item('ok', { status: 'published' })],
  rejectedOrHidden: [],
}

function mockApi(homeBlockEnabled = false) {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/admin/collections') return { ok: true, json: async () => ({ queue }) }
    if (url === '/api/admin/collections/settings' && init?.method === 'PATCH') {
      return { ok: true, json: async () => JSON.parse(String(init.body)) }
    }
    return { ok: true, json: async () => ({ homeBlockEnabled }) }
  }) as never
}

it('секции со счётчиками и сводка изменений', async () => {
  mockApi()
  const onCountChange = jest.fn()
  await act(async () => { render(<AdminCollectionsPanel onCountChange={onCountChange} />) })
  expect(within(screen.getByTestId('queue-pending')).getByText('Подборка p1')).toBeInTheDocument()
  expect(within(screen.getByTestId('queue-changed')).getByText(/\+1 · −1 · текст/)).toBeInTheDocument()
  expect(screen.getByTestId('queue-rejected-hidden')).toHaveTextContent('Пусто')
  expect(onCountChange).toHaveBeenCalledWith(2)
})

it('первым выбирается верх очереди, клик меняет выбор', async () => {
  mockApi()
  await act(async () => { render(<AdminCollectionsPanel />) })
  expect(screen.getByTestId('review')).toHaveTextContent('p1')
  fireEvent.click(screen.getByText('Подборка ok'))
  expect(screen.getByTestId('review')).toHaveTextContent('ok')
})

it('initialSelectedId выбирает подборку из адреса', async () => {
  mockApi()
  await act(async () => { render(<AdminCollectionsPanel initialSelectedId="ok" />) })
  expect(screen.getByTestId('review')).toHaveTextContent('ok')
})

it('переключатель блока на главной', async () => {
  mockApi(false)
  await act(async () => { render(<AdminCollectionsPanel />) })
  const toggle = screen.getByRole('button', { name: /Блок подборок на главной/ })
  expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await act(async () => { fireEvent.click(toggle) })
  expect(global.fetch).toHaveBeenCalledWith('/api/admin/collections/settings', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ homeBlockEnabled: true }) }))
  expect(toggle).toHaveAttribute('aria-pressed', 'true')
})
```

- [ ] **Step 2: Прогон — падает**

- [ ] **Step 3: Реализация**

```tsx
// components/nd/AdminCollectionsPanel.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AdminCollectionQueue, AdminQueueItem } from '@/lib/collections/types'
import { formatChangedAt, formatDiffSummary, textsCount } from '@/lib/collections/format'
import CoverImage from './CoverImage'
import AdminCollectionReview from './AdminCollectionReview'

interface Props {
  initialSelectedId?: string | null
  onCountChange?: (count: number) => void
}

const SECTIONS: Array<{ key: keyof AdminCollectionQueue; title: string; testId: string; accentCount?: boolean }> = [
  { key: 'pending', title: 'Ждут проверки', testId: 'queue-pending', accentCount: true },
  { key: 'changed', title: 'Изменились после проверки', testId: 'queue-changed' },
  { key: 'published', title: 'Опубликованные', testId: 'queue-published' },
  { key: 'rejectedOrHidden', title: 'Отклонённые и скрытые', testId: 'queue-rejected-hidden' },
]

function when(iso: string): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return `${formatChangedAt(date, new Date()).absolute}, ${time}`
}

export default function AdminCollectionsPanel({ initialSelectedId = null, onCountChange }: Props) {
  const [queue, setQueue] = useState<AdminCollectionQueue | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)
  const [homeBlockEnabled, setHomeBlockEnabled] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/collections')
    const body = await res.json()
    if (!res.ok) {
      setError(body.error === 'migration_required' ? 'Подборки ещё не включены: примените миграцию 0066.' : 'Не удалось загрузить подборки.')
      return
    }
    const next = body.queue as AdminCollectionQueue
    setQueue(next)
    onCountChange?.(next.pending.length + next.changed.length)
    setSelectedId((current) => {
      const all = SECTIONS.flatMap((s) => next[s.key])
      if (current && all.some((item) => item.id === current)) return current
      return all[0]?.id ?? null
    })
  }, [onCountChange])

  useEffect(() => {
    void load()
    void fetch('/api/admin/collections/settings').then(async (res) => {
      if (res.ok) setHomeBlockEnabled((await res.json()).homeBlockEnabled)
    })
  }, [load])

  async function toggleHomeBlock() {
    if (homeBlockEnabled === null) return
    const res = await fetch('/api/admin/collections/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeBlockEnabled: !homeBlockEnabled }),
    })
    if (res.ok) setHomeBlockEnabled((await res.json()).homeBlockEnabled)
  }

  function renderItem(item: AdminQueueItem) {
    const selected = item.id === selectedId
    const summary = item.diffSummary ? formatDiffSummary(item.diffSummary) : ''
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => setSelectedId(item.id)}
        data-testid="queue-item"
        style={{
          display: 'block', width: '100%', textAlign: 'left', padding: '13px 16px', cursor: 'pointer', fontFamily: 'var(--nd-sans)',
          border: 'none', borderBottom: '1px solid var(--border)', borderLeft: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
          background: selected ? 'var(--bg-tint)' : 'transparent',
        }}
      >
        <div style={{ fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: 15, lineHeight: 1.2, color: 'var(--text)' }}>{item.title}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
          {item.displayName || '—'} · {when(item.at)} · {summary ? <span style={{ color: 'var(--accent)' }}>{summary}</span> : textsCount(item.textsCount)}
        </div>
        {item.status === 'pending' && item.covers.length > 0 && (
          <div style={{ display: 'flex', gap: 3, marginTop: 9 }}>
            {item.covers.map((cover) => (
              <span key={cover.id} style={{ width: 20, aspectRatio: '2 / 3', overflow: 'hidden' }}>
                <CoverImage coverUrl={cover.coverUrl} title={cover.title} author={cover.author} />
              </span>
            ))}
          </div>
        )}
      </button>
    )
  }

  return (
    <div data-testid="admin-collections">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          type="button"
          aria-pressed={homeBlockEnabled === true}
          disabled={homeBlockEnabled === null}
          onClick={toggleHomeBlock}
          className={homeBlockEnabled ? 'p-btn sm' : 'p-btn ghost sm'}
        >
          Блок подборок на главной: {homeBlockEnabled ? 'включён' : 'выключен'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ссылка «Подборки» в шапке и страницы подборок работают всегда.</span>
      </div>

      {error && <p style={{ fontSize: 12, color: 'var(--accent)' }}>{error}</p>}

      {queue && (
        <div className="admin-collections-grid" style={{ display: 'grid', gridTemplateColumns: '330px 1fr', minHeight: 600, border: '1px solid var(--border)' }}>
          <div className="admin-collections-list" style={{ borderRight: '1px solid var(--border)' }}>
            {SECTIONS.map((section) => (
              <div key={section.key} data-testid={section.testId}>
                <div style={{ padding: '11px 16px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)' }}>{section.title}</span>
                  <span style={{ fontFamily: 'var(--nd-mono)', fontSize: 11, color: section.accentCount ? 'var(--accent)' : 'var(--text-muted)' }}>{queue[section.key].length}</span>
                </div>
                {queue[section.key].length === 0
                  ? <div style={{ padding: '13px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Пусто.</div>
                  : queue[section.key].map(renderItem)}
              </div>
            ))}
          </div>
          <div style={{ padding: '22px 24px' }}>
            {selectedId
              ? <AdminCollectionReview key={selectedId} id={selectedId} onChanged={load} />
              : <div style={{ border: '1px dashed var(--border)', padding: '30px 22px', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>Очередь пуста. Новые и изменённые подборки появятся здесь.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
```

`app/globals.css` — рядом с другими медиа-правилами:

```css
@media (max-width: 720px) {
  .admin-collections-grid { grid-template-columns: 1fr !important; }
  .admin-collections-list { border-right: none !important; border-bottom: 1px solid var(--border-strong); }
}
```

- [ ] **Step 4: Прогон** — падает только на отсутствующем `AdminCollectionReview`, если мок не подхватился; создай пустой файл-заглушку `export default function AdminCollectionReview() { return null }` и прогони → PASS. Заглушка заменяется в Task 2.

- [ ] **Step 5: Коммит**

```bash
git add components/nd/AdminCollectionsPanel.tsx components/nd/AdminCollectionsPanel.test.tsx components/nd/AdminCollectionReview.tsx app/globals.css
git commit -m "feat(collections): очередь модерации и переключатель блока на главной"
```

---

### Task 2: Разбор подборки, разница, причина, правка и удаление

**Files:**
- Create: `components/nd/CollectionReasonSheet.tsx`, `components/nd/AdminCollectionReview.tsx` (заменить заглушку), `components/nd/AdminCollectionReview.test.tsx`

**Interfaces:**
- Consumes: `GET/PATCH/DELETE /api/admin/collections/[id]`, `POST /api/admin/collections/[id]/actions`, `CollectionDiff`, `EditorBook`, `SerializedCollection`, `CollectionEditor` (`mode="admin"`), `SummaryMarkdown`, `AuthorAvatar`, `collectionIssueText`, `COLLECTION_STATUS_LABEL`
- Produces: `<AdminCollectionReview id onChanged />`, `<CollectionReasonSheet kind onSubmit onCancel />`

- [ ] **Step 1: Тест**

```tsx
// components/nd/AdminCollectionReview.test.tsx
/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import AdminCollectionReview from './AdminCollectionReview'

jest.mock('./CoverImage', () => ({ __esModule: true, default: () => <span /> }))
jest.mock('./AuthorAvatar', () => ({ __esModule: true, default: () => <span /> }))
jest.mock('./SummaryMarkdown', () => ({ __esModule: true, default: ({ markdown }: { markdown: string }) => <div>{markdown}</div> }))
jest.mock('./CollectionEditor', () => ({ __esModule: true, default: () => <div data-testid="admin-editor" /> }))

const book = (id: string) => ({ id, title: `Книга ${id}`, author: 'Автор', coverUrl: null, year: '', isArticle: false, clubStatus: null, hiddenFromCatalog: false })
const collection = (overrides = {}) => ({
  id: 'c1', slug: 'tema', authorUserId: 'u', displayName: 'Аня', title: 'Тема', descriptionMarkdown: 'Новый текст',
  status: 'pending', moderationReason: null, bookIds: ['a', 'b'],
  submittedAt: '2026-09-11T11:02:00Z', editedAt: null, publishedAt: null, reviewedAt: null, reviewedSnapshot: null,
  createdAt: '2026-09-10T00:00:00Z', updatedAt: '2026-09-11T11:02:00Z', ...overrides,
})

function mockDetail(detail: unknown) {
  global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST' || init?.method === 'DELETE') return { ok: true, json: async () => ({ collection: collection() }) }
    return { ok: true, json: async () => detail }
  }) as never
}

it('новая: описание, состав, «Опубликовать»', async () => {
  mockDetail({ collection: collection(), books: [book('a'), book('b')], diff: null })
  const onChanged = jest.fn()
  await act(async () => { render(<AdminCollectionReview id="c1" onChanged={onChanged} />) })
  expect(screen.getByText('НОВАЯ — ЖДЁТ ПРОВЕРКИ')).toBeInTheDocument()
  expect(screen.getByText('Книга b')).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' })) })
  expect(global.fetch).toHaveBeenCalledWith('/api/admin/collections/c1/actions', expect.objectContaining({ body: JSON.stringify({ action: 'publish' }) }))
  expect(onChanged).toHaveBeenCalled()
})

it('отклонение требует причину', async () => {
  mockDetail({ collection: collection(), books: [book('a'), book('b')], diff: null })
  await act(async () => { render(<AdminCollectionReview id="c1" onChanged={jest.fn()} />) })
  fireEvent.click(screen.getByRole('button', { name: 'Отклонить с причиной' }))
  const send = screen.getByRole('button', { name: 'Отправить и отклонить' })
  expect(send).toBeDisabled()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Добавьте описание' } })
  await act(async () => { fireEvent.click(send) })
  expect(global.fetch).toHaveBeenCalledWith('/api/admin/collections/c1/actions', expect.objectContaining({ body: JSON.stringify({ action: 'reject', reason: 'Добавьте описание' }) }))
})

it('изменённая: только разница и «Правка проверена»', async () => {
  mockDetail({
    collection: collection({ status: 'published', editedAt: '2026-09-12T00:00:00Z', reviewedAt: '2026-09-01T00:00:00Z' }),
    books: [book('a'), book('b'), book('c')],
    diff: { added: ['c'], removed: ['b'], moved: [{ bookId: 'a', from: 2, to: 1 }], title: null, description: { before: 'Старый', after: 'Новый текст' }, displayName: null },
  })
  await act(async () => { render(<AdminCollectionReview id="c1" onChanged={jest.fn()} />) })
  expect(screen.getByText('ИЗМЕНЕНА ПОСЛЕ ПРОВЕРКИ')).toBeInTheDocument()
  expect(screen.getByTestId('diff-added')).toHaveTextContent('Книга c')
  expect(screen.getByTestId('diff-removed')).toHaveTextContent('Книга b')
  expect(screen.getByTestId('diff-moved')).toHaveTextContent('2 → 1')
  expect(screen.getByText('Старый').tagName).toBe('DEL')
  expect(screen.getByRole('button', { name: 'Правка проверена' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Скрыть с причиной' })).toBeInTheDocument()
})

it('скрытая: вернуть в публикацию и удалить', async () => {
  mockDetail({ collection: collection({ status: 'hidden', moderationReason: 'Нет описания' }), books: [book('a')], diff: null })
  window.confirm = jest.fn(() => true)
  await act(async () => { render(<AdminCollectionReview id="c1" onChanged={jest.fn()} />) })
  expect(screen.getByText(/Нет описания/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Вернуть в публикацию' })).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Удалить' })) })
  expect(global.fetch).toHaveBeenCalledWith('/api/admin/collections/c1', { method: 'DELETE' })
})

it('«Править» открывает редактор в режиме админа', async () => {
  mockDetail({ collection: collection(), books: [book('a'), book('b')], diff: null })
  await act(async () => { render(<AdminCollectionReview id="c1" onChanged={jest.fn()} />) })
  fireEvent.click(screen.getAllByRole('button', { name: 'Править' })[0])
  expect(screen.getByTestId('admin-editor')).toBeInTheDocument()
})
```

- [ ] **Step 2: Прогон — падает**

- [ ] **Step 3: Реализация**

```tsx
// components/nd/CollectionReasonSheet.tsx
'use client'

import { useState } from 'react'

interface Props {
  kind: 'reject' | 'hide'
  onSubmit: (reason: string) => Promise<void>
  onCancel: () => void
}

export default function CollectionReasonSheet({ kind, onSubmit, onCancel }: Props) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div role="dialog" aria-label={kind === 'reject' ? 'Причина отказа' : 'Почему скрываем'} style={{ border: '1px solid var(--border-strong)', padding: 16, marginTop: 14 }}>
      <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)' }}>
        {kind === 'reject' ? 'Причина отказа' : 'Почему скрываем'}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '8px 0 10px', lineHeight: 1.5 }}>
        Автор увидит этот текст в профиле рядом с подборкой. Пишите, что поправить, чтобы её опубликовали.
      </p>
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Например: добавьте два-три текста и абзац о том, зачем это читать"
        style={{ width: '100%', minHeight: 80, fontFamily: 'var(--nd-sans)', fontSize: 13, border: '1px solid var(--border)', borderBottom: '2px solid var(--border-strong)', padding: 11, background: 'var(--bg-input)', outline: 'none', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="p-btn sm"
          disabled={!reason.trim() || busy}
          onClick={async () => {
            setBusy(true)
            try { await onSubmit(reason.trim()) } finally { setBusy(false) }
          }}
        >
          {kind === 'reject' ? 'Отправить и отклонить' : 'Отправить и скрыть'}
        </button>
        <button type="button" className="p-btn ghost sm" onClick={onCancel}>Отмена</button>
      </div>
    </div>
  )
}
```

```tsx
// components/nd/AdminCollectionReview.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CollectionDiff } from '@/lib/collections/diff'
import type { AdminCollectionAction, EditorBook, SerializedCollection } from '@/lib/collections/types'
import { collectionIssueText, formatChangedAt, textsCount } from '@/lib/collections/format'
import CoverImage from './CoverImage'
import AuthorAvatar from './AuthorAvatar'
import SummaryMarkdown from './SummaryMarkdown'
import CollectionEditor from './CollectionEditor'
import CollectionReasonSheet from './CollectionReasonSheet'
import { COLLECTION_REASON_PREFIX, COLLECTION_STATUS_LABEL } from './collection-status'

interface Detail { collection: SerializedCollection; books: EditorBook[]; diff: CollectionDiff | null }
interface Props { id: string; onChanged: () => void }

const box: React.CSSProperties = { border: '1px solid var(--border)', margin: '16px 0' }
const boxHead: React.CSSProperties = { padding: '9px 13px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const eyebrow: React.CSSProperties = { fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)' }
const line: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', padding: '9px 13px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }
const mark: React.CSSProperties = { fontFamily: 'var(--nd-mono)', fontSize: 12, width: 14, flexShrink: 0 }

function Cover({ book, dim = false }: { book: EditorBook | undefined; dim?: boolean }) {
  if (!book) return null
  return (
    <span style={{ width: 22, aspectRatio: '2 / 3', overflow: 'hidden', opacity: dim ? 0.45 : 1, flex: 'none' }}>
      <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
    </span>
  )
}

function TextChange({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div style={box}>
      <div style={boxHead}><span style={eyebrow}>{label}</span></div>
      <div style={{ fontFamily: 'var(--nd-serif)', fontSize: 14, lineHeight: 1.6, padding: '12px 13px', whiteSpace: 'pre-wrap' }}>
        <del style={{ background: 'var(--accent-soft)', color: 'var(--text-secondary)' }}>{before}</del>{' '}
        <ins style={{ background: 'var(--bg-tag-green)', textDecoration: 'none', color: 'var(--text)' }}>{after}</ins>
      </div>
    </div>
  )
}

export default function AdminCollectionReview({ id, onChanged }: Props) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [reasonKind, setReasonKind] = useState<'reject' | 'hide' | null>(null)
  const [editing, setEditing] = useState(false)
  const [issues, setIssues] = useState<string[]>([])

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/collections/${id}`)
    if (res.ok) setDetail(await res.json())
  }, [id])

  useEffect(() => { void load() }, [load])

  async function act(action: AdminCollectionAction, reason?: string) {
    setIssues([])
    const res = await fetch(`/api/admin/collections/${id}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reason === undefined ? { action } : { action, reason }),
    })
    const body = await res.json()
    if (!res.ok) {
      setIssues(Array.isArray(body.issues) ? body.issues : [body.error ?? 'collections_failed'])
      return
    }
    setReasonKind(null)
    await load()
    onChanged()
  }

  async function remove() {
    if (!window.confirm('Удалить подборку? Ссылки на неё перестанут работать.')) return
    const res = await fetch(`/api/admin/collections/${id}`, { method: 'DELETE' })
    if (res.ok) onChanged()
  }

  if (!detail) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Загружаю…</div>
  const { collection, books, diff } = detail
  const byId = new Map(books.map((b) => [b.id, b]))
  const isChanged = collection.status === 'published' && Boolean(diff) && Boolean(collection.editedAt)
    && (!collection.reviewedAt || new Date(collection.editedAt!).getTime() > new Date(collection.reviewedAt).getTime())
  const statusTitle = collection.status === 'pending'
    ? 'НОВАЯ — ЖДЁТ ПРОВЕРКИ'
    : isChanged ? 'ИЗМЕНЕНА ПОСЛЕ ПРОВЕРКИ' : COLLECTION_STATUS_LABEL[collection.status].toUpperCase()
  const at = collection.submittedAt ?? collection.editedAt ?? collection.updatedAt
  const reasonPrefix = COLLECTION_REASON_PREFIX[collection.status]

  if (editing) {
    return (
      <CollectionEditor
        mode="admin"
        initial={collection}
        initialBooks={books.filter((b) => collection.bookIds.includes(b.id))}
        onSaved={async () => { setEditing(false); await load(); onChanged() }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div data-testid="admin-collection-review">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: collection.status === 'pending' ? 'var(--accent)' : 'var(--success)', borderBottom: '1px solid currentColor', paddingBottom: 2 }}>
            {statusTitle}
          </span>
          <div style={{ fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: 24, lineHeight: 1.15, marginTop: 9 }}>{collection.title}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <AuthorAvatar name={collection.displayName || '?'} size={24} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {collection.displayName || '—'} · {formatChangedAt(new Date(at), new Date()).absolute}
            </span>
          </div>
        </div>
        <a className="p-btn ghost sm" href={`/collections/${collection.slug ?? collection.id}`} target="_blank" rel="noreferrer">Открыть как читатель</a>
      </div>

      {reasonPrefix && collection.moderationReason && (
        <div style={{ marginTop: 14, borderLeft: '2px solid var(--accent)', paddingLeft: 11, fontSize: 12, lineHeight: 1.55 }}>
          <b style={{ fontWeight: 500 }}>{reasonPrefix}</b> {collection.moderationReason}
        </div>
      )}

      {isChanged && diff ? (
        <>
          <div style={{ marginTop: 20, marginBottom: 4 }}><span style={eyebrow}>Что изменилось с прошлой проверки</span></div>
          <div style={box}>
            <div style={boxHead}><span style={eyebrow}>Состав</span><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>порядок — не повод для проверки</span></div>
            {diff.added.map((bookId) => (
              <div key={`a-${bookId}`} data-testid="diff-added" style={line}>
                <span style={{ ...mark, color: 'var(--success)' }}>+</span><Cover book={byId.get(bookId)} />
                <span>{byId.get(bookId)?.title ?? bookId}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>добавлена</span>
              </div>
            ))}
            {diff.removed.map((bookId) => (
              <div key={`r-${bookId}`} data-testid="diff-removed" style={{ ...line, color: 'var(--text-muted)' }}>
                <span style={{ ...mark, color: 'var(--accent)' }}>−</span><Cover book={byId.get(bookId)} dim />
                <span style={{ textDecoration: 'line-through' }}>{byId.get(bookId)?.title ?? bookId}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11 }}>убрана</span>
              </div>
            ))}
            {diff.moved.map((move) => (
              <div key={`m-${move.bookId}`} data-testid="diff-moved" style={line}>
                <span style={{ ...mark, color: 'var(--text-secondary)' }}>↕</span><Cover book={byId.get(move.bookId)} />
                <span>{byId.get(move.bookId)?.title ?? move.bookId}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{move.from} → {move.to}</span>
              </div>
            ))}
            {diff.added.length + diff.removed.length + diff.moved.length === 0 && (
              <div style={{ ...line, color: 'var(--text-muted)' }}>Состав без изменений</div>
            )}
          </div>
          {diff.title && <TextChange label="Название" before={diff.title.before} after={diff.title.after} />}
          {diff.displayName && <TextChange label="Подпись" before={diff.displayName.before} after={diff.displayName.after} />}
          {diff.description
            ? <TextChange label="Описание" before={diff.description.before} after={diff.description.after} />
            : <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12 }}><b style={{ fontWeight: 500, color: 'var(--text)' }}>Описание</b> — без изменений</div>}
        </>
      ) : (
        <>
          <div style={{ ...box, marginTop: 20 }}>
            <div style={boxHead}>
              <span style={eyebrow}>Описание</span>
              <button type="button" className="p-link muted" onClick={() => setEditing(true)}>Править</button>
            </div>
            <div style={{ fontFamily: 'var(--nd-serif)', fontSize: 14, lineHeight: 1.6, padding: '12px 13px' }}>
              <SummaryMarkdown markdown={collection.descriptionMarkdown} />
            </div>
          </div>
          <div style={box}>
            <div style={boxHead}>
              <span style={eyebrow}>Состав · {textsCount(collection.bookIds.length)}</span>
              <button type="button" className="p-link muted" onClick={() => setEditing(true)}>Править</button>
            </div>
            {collection.bookIds.map((bookId, index) => {
              const book = byId.get(bookId)
              return (
                <div key={bookId} style={line}>
                  <span style={{ ...mark, color: 'var(--text-muted)' }}>{index + 1}</span>
                  <Cover book={book} />
                  <span>{book?.title ?? bookId}{book?.hiddenFromCatalog && <span style={{ color: 'var(--accent)' }}> · скрыта из каталога</span>}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{book?.author}</span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {issues.length > 0 && (
        <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 10, fontSize: 12, marginTop: 12 }}>
          {issues.map((issue) => <div key={issue}>{collectionIssueText(issue)}</div>)}
        </div>
      )}

      {reasonKind ? (
        <CollectionReasonSheet kind={reasonKind} onSubmit={(reason) => act(reasonKind, reason)} onCancel={() => setReasonKind(null)} />
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 16, borderTop: '1px solid var(--border)', marginTop: 18, alignItems: 'center' }}>
          {collection.status === 'pending' && (
            <>
              <button type="button" className="p-btn sm" onClick={() => act('publish')}>Опубликовать</button>
              <button type="button" className="p-btn ghost sm" onClick={() => setReasonKind('reject')}>Отклонить с причиной</button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>После публикации подборка появится на главной и в списке.</span>
            </>
          )}
          {isChanged && (
            <>
              <button type="button" className="p-btn sm" onClick={() => act('mark_reviewed')}>Правка проверена</button>
              <button type="button" className="p-btn ghost sm" onClick={() => setReasonKind('hide')}>Скрыть с причиной</button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Правка уже видна читателям.</span>
            </>
          )}
          {collection.status === 'published' && !isChanged && (
            <>
              <button type="button" className="p-btn ghost sm" onClick={() => setEditing(true)}>Править</button>
              <button type="button" className="p-btn ghost sm" onClick={() => setReasonKind('hide')}>Скрыть с причиной</button>
            </>
          )}
          {collection.status === 'hidden' && (
            <button type="button" className="p-btn sm" onClick={() => act('unhide')}>Вернуть в публикацию</button>
          )}
          {(collection.status === 'hidden' || collection.status === 'rejected') && (
            <button type="button" className="p-btn ghost sm" onClick={() => setEditing(true)}>Править</button>
          )}
          {collection.status !== 'pending' && (
            <button type="button" onClick={remove} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--accent)' }}>
              Удалить
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

> Роут `GET /api/admin/collections/[id]` в PR 1 отдаёт `books` вместе с книгами снимка — поэтому у убранных книг есть названия. Если книга удалена из каталога совсем, показывается её id — это ожидаемо.

- [ ] **Step 4: Прогон** `npx jest components/nd/AdminCollection` → PASS

- [ ] **Step 5: Коммит**

```bash
git add components/nd/CollectionReasonSheet.tsx components/nd/AdminCollectionReview.tsx components/nd/AdminCollectionReview.test.tsx
git commit -m "feat(collections): разбор подборки, разница с проверкой и действия модератора"
```

---

### Task 3: Вкладка в `AdminPanel`

**Files:**
- Modify: `components/nd/AdminPanel.tsx`
- Test: `components/nd/AdminPanel.test.tsx`

- [ ] **Step 1: Тест** — дописать в `components/nd/AdminPanel.test.tsx`, используя уже принятый в файле способ рендера `AdminPanel` (скопируй пропсы из соседнего теста):

```tsx
jest.mock('./AdminCollectionsPanel', () => ({ __esModule: true, default: () => <div data-testid="admin-collections-panel" /> }))

it('вкладка «Подборки» открывает модерацию подборок', () => {
  renderAdminPanel() // существующий помощник файла; если его нет — render(<AdminPanel {...defaultProps} />)
  fireEvent.click(screen.getByTestId('admin-tab-collections'))
  expect(screen.getByTestId('admin-collections-panel')).toBeInTheDocument()
})
```

- [ ] **Step 2: Прогон — падает**

- [ ] **Step 3: Реализация** в `components/nd/AdminPanel.tsx`:

```tsx
import AdminCollectionsPanel from './AdminCollectionsPanel'

type View = 'users' | 'catalog' | 'tags' | 'submissions' | 'summaries' | 'collections' | 'feedback' | 'intro' | 'matching' | 'timeline' | 'audit'
const ADMIN_VIEWS: View[] = ['users', 'catalog', 'tags', 'submissions', 'summaries', 'collections', 'feedback', 'intro', 'matching', 'timeline', 'audit']

// рядом с другими useState:
const [collectionsCount, setCollectionsCount] = useState(0)
const initialCollectionId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('collection') : null

useEffect(() => {
  // Счётчик в табе виден сразу, без захода во вкладку.
  fetch('/api/admin/collections')
    .then(async (res) => {
      if (!res.ok) return
      const { queue } = await res.json()
      setCollectionsCount(queue.pending.length + queue.changed.length)
    })
    .catch(() => {})
}, [])

// в ряду табов после «Саммари»:
<button style={tabStyle(view === 'collections')} onClick={() => selectView('collections')} data-testid="admin-tab-collections">
  Подборки
  <CountBadge count={collectionsCount} />
</button>

// рядом с другими телами вкладок:
{view === 'collections' && (
  <AdminCollectionsPanel initialSelectedId={initialCollectionId} onCountChange={setCollectionsCount} />
)}
```

> `initialCollectionId` читается при рендере на клиенте; `AdminPanel` — клиентский компонент. Если в файле уже есть чтение `searchParams` (строка ~921, `params.delete('sub')`), возьми параметр оттуда же, чтобы не дублировать. Если в тестах `fetch` не замокан, эффект упадёт тихо (`.catch`); при необходимости добавь в тест `global.fetch = jest.fn().mockResolvedValue({ ok: false })`.

- [ ] **Step 4: Прогон** `npx jest components/nd/AdminPanel` → PASS

- [ ] **Step 5: Коммит**

```bash
git add components/nd/AdminPanel.tsx components/nd/AdminPanel.test.tsx
git commit -m "feat(collections): вкладка «Подборки» в админке со счётчиком"
```

---

### Task 4: E2E, документация, PR

**Files:**
- Create: `e2e/collections-admin.spec.ts`
- Modify: `docs/features/collections.md`, `docs/wiki/Book-Collections.md`, `docs/wiki/Admin-Panel.md`

- [ ] **Step 1: Спека** (перечитай `docs/features/testing.md` → «Смена сессии при открытой странице»)

```ts
// e2e/collections-admin.spec.ts
import { epic, feature } from 'allure-js-commons'
import { expect, test, type Page } from './fixtures'

test.beforeEach(async () => {
  await epic('Администрирование')
  await feature('Модерация подборок')
})

async function openModeration(page: Page) {
  await page.goto('/admin?view=collections')
  await expect(page.getByTestId('admin-collections')).toBeVisible({ timeout: 15_000 })
}

test('владелец публикует новую подборку — гость видит её в списке', async ({ browser, page, loginAsUser, loginAsAdmin, createTestBook, createTestCollection }) => {
  const books = [await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({ authorUserId: author.userId, bookIds: books.map((b) => b.id), status: 'pending' })

  await loginAsAdmin()
  await openModeration(page)
  await page.getByTestId('queue-pending').getByText(collection.title).click()
  await Promise.all([
    page.waitForResponse((res) => res.url().includes(`/api/admin/collections/${collection.id}/actions`), { timeout: 15_000 }),
    page.getByRole('button', { name: 'Опубликовать' }).click(),
  ])
  await page.reload()
  await expect(page.getByTestId('queue-published')).toContainText(collection.title)

  const guest = await browser.newContext()
  const guestPage = await guest.newPage()
  await guestPage.goto('/collections')
  await guestPage.getByText(collection.title).click()
  await expect(guestPage.getByRole('heading', { name: collection.title })).toBeVisible()
  await guest.close()
})

test('правка после проверки видна разницей и снимается «Правка проверена»', async ({ page, loginAsUser, loginAsAdmin, createTestBook, createTestCollection }) => {
  const [kept, added] = [await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({
    authorUserId: author.userId, bookIds: [kept.id, added.id], reviewedBookIds: [kept.id], editedAfterReview: true,
  })

  await loginAsAdmin()
  await openModeration(page)
  const changed = page.getByTestId('queue-changed')
  await expect(changed).toContainText(collection.title)
  await expect(changed).toContainText('+1')
  await changed.getByText(collection.title).click()
  await expect(page.getByTestId('diff-added')).toContainText(added.title)
  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/actions'), { timeout: 15_000 }),
    page.getByRole('button', { name: 'Правка проверена' }).click(),
  ])
  await page.reload()
  await expect(page.getByTestId('queue-changed')).not.toContainText(collection.title)
})

test('перестановка текстов автором не отправляет подборку на проверку', async ({ page, loginAsUser, loginAsAdmin, createTestBook, createTestCollection }) => {
  const [first, second] = [await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({ authorUserId: author.userId, bookIds: [first.id, second.id], displayName: 'E2E Автор', description: 'Описание' })

  const res = await page.request.patch(`/api/me/collections/${collection.id}`, {
    data: { title: collection.title, descriptionMarkdown: 'Описание', displayName: 'E2E Автор', bookIds: [second.id, first.id] },
    timeout: 15_000,
  })
  expect(res.ok()).toBeTruthy()

  await loginAsAdmin()
  await openModeration(page)
  await expect(page.getByTestId('queue-changed')).not.toContainText(collection.title)
  await expect(page.getByTestId('queue-published')).toContainText(collection.title)
})

test('скрытие с причиной: гость получает 404, автор видит причину в профиле', async ({ browser, page, loginAsUser, loginAsAdmin, createTestBook, createTestCollection }) => {
  const books = [await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({ authorUserId: author.userId, bookIds: books.map((b) => b.id) })

  await loginAsAdmin()
  await openModeration(page)
  await page.getByTestId('queue-published').getByText(collection.title).click()
  await page.getByRole('button', { name: 'Скрыть с причиной' }).click()
  await page.getByRole('dialog', { name: 'Почему скрываем' }).getByRole('textbox').fill('E2E: напишите пару абзацев')
  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/actions'), { timeout: 15_000 }),
    page.getByRole('button', { name: 'Отправить и скрыть' }).click(),
  ])

  const guest = await browser.newContext()
  const guestPage = await guest.newPage()
  const response = await guestPage.goto(collection.url)
  expect(response?.status()).toBe(404)
  await guest.close()

  await loginAsUser({ email: author.email, name: author.name })
  await page.request.patch('/api/profile', { data: { name: author.name, contacts: '@e2e_author' }, timeout: 15_000 })
  const mine = await page.request.get('/api/me/collections')
  const body = await mine.json()
  expect(body.collections.find((c: { id: string }) => c.id === collection.id)).toMatchObject({ status: 'hidden', moderationReason: 'E2E: напишите пару абзацев' })
  // Интерфейс профиля: открой ProfileDrawer так же, как e2e/profile-mybooks.spec.ts, затем вкладку «Подборки».
})

test('владелец удаляет опубликованную подборку', async ({ browser, page, loginAsUser, loginAsAdmin, createTestBook, createTestCollection }) => {
  const books = [await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({ authorUserId: author.userId, bookIds: books.map((b) => b.id) })

  await loginAsAdmin()
  await openModeration(page)
  await page.getByTestId('queue-published').getByText(collection.title).click()
  page.once('dialog', (dialog) => dialog.accept())
  await Promise.all([
    page.waitForResponse((res) => res.url().endsWith(`/api/admin/collections/${collection.id}`) && res.request().method() === 'DELETE', { timeout: 15_000 }),
    page.getByRole('button', { name: 'Удалить' }).click(),
  ])

  const guest = await browser.newContext()
  const guestPage = await guest.newPage()
  expect((await guestPage.goto(collection.url))?.status()).toBe(404)
  await guest.close()
})
```

В тесте скрытия допиши проверку интерфейса профиля: открой `ProfileDrawer` приёмом из `e2e/profile-mybooks.spec.ts`, кликни вкладку «Подборки», проверь `getByTestId('profile-collection-row').filter({ hasText: collection.title })` содержит «Скрыта» и «Почему скрыли:», затем `page.reload()`, снова открой и проверь.

- [ ] **Step 2: Прогон** `npm run test:e2e:focused -- e2e/collections-admin.spec.ts`

- [ ] **Step 3: Документация.** `docs/wiki/Admin-Panel.md` — раздел «Подборки»: переключатель, четыре секции, что значит «Правка проверена», причина обязательна, перестановка не попадает в очередь, удаление ломает ссылки. `docs/wiki/Book-Collections.md` и `docs/features/collections.md` — ссылки на этот раздел и описание компонентов.

- [ ] **Step 4: Проверка, коммит, PR**

```bash
npm run lint && npm run typecheck && npm test
```

В ответе:
- «E2E: нужен — новый админский флоу с персистентным состоянием (публикация, проверка правки, скрытие, удаление) и условный рендер секций; `e2e/collections-admin.spec.ts` прогнан focused».
- «Wiki: нужна — новый админский workflow (`docs/wiki/Admin-Panel.md`)».

```bash
git add e2e/collections-admin.spec.ts docs
git commit -m "test(collections): E2E модерации и документация админки"
git push -u origin feat/collections-moderation
gh pr create --fill
gh pr merge --auto --squash --delete-branch
gh pr view --json number,mergeStateStatus,mergeable
```

После мержа — сообщить, что `../book-club-collections-3` можно удалить.
