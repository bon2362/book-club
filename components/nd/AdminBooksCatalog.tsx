'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'

export interface CatalogParticipant {
  userId: string
  name: string
  rank: number | null
}

interface AdminBook {
  id: string
  title: string
  author: string
  tags: string[]
  type: string
  pages: number | null
  publishedDate: string
  textUrl: string
  description: string
  coverUrl: string | null
  whyRead: string | null
  recommendationLink: string | null
  readingStatus: string | null
  visibility: 'hidden' | 'published'
  isNew: boolean
  sortOrder: number
  source: 'admin' | 'submission' | 'sheets_import'
  archivedAt: string | null
  publishedAt: string | null
  hiddenAt: string | null
  createdAt: string
  updatedAt: string
  signupCount: number
}

type VisibilityFilter = 'all' | 'published' | 'hidden'
type StatusFilter = 'all' | 'reading' | 'read' | 'none'
type SourceFilter = 'all' | 'admin' | 'submission' | 'sheets_import'
type ArchiveFilter = 'active' | 'archived' | 'all'

const headCell: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#666',
  borderBottom: '2px solid #111',
  fontWeight: 700,
  padding: '0.5rem 0.75rem',
  textAlign: 'left',
}

const cell: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.8rem',
  color: '#111',
  padding: '0.5rem 0.75rem',
  borderBottom: '1px solid #E5E5E5',
  verticalAlign: 'top',
}

const fieldLabel: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#666',
  marginBottom: '0.25rem',
}

const fieldInput: React.CSSProperties = {
  display: 'block',
  width: '100%',
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.8rem',
  color: '#111',
  borderTop: '1px solid #E5E5E5',
  borderRight: '1px solid #E5E5E5',
  borderLeft: '1px solid #E5E5E5',
  borderBottom: '2px solid #111',
  padding: '0.35rem 0.5rem',
  outline: 'none',
  background: '#fff',
  boxSizing: 'border-box',
}

const filterBtnStyle = (active: boolean): React.CSSProperties => ({
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  padding: '0.2rem 0.5rem',
  border: '1px solid #999',
  background: active ? '#111' : 'transparent',
  color: active ? '#fff' : '#666',
  cursor: 'pointer',
})

const actionBtnStyle = (color: string, disabled: boolean): React.CSSProperties => ({
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  padding: '0.3rem 0.75rem',
  border: `1px solid ${disabled ? '#E5E5E5' : color}`,
  background: 'transparent',
  color: disabled ? '#999' : color,
  cursor: disabled ? 'default' : 'pointer',
})

const sourceLabel: Record<string, string> = {
  admin: 'Админ',
  submission: 'Заявка',
  sheets_import: 'Sheets',
}

const sourceColor: Record<string, string> = {
  admin: '#2E7D32',
  submission: '#C0603A',
  sheets_import: '#666',
}

const EMPTY_FORM: Omit<AdminBook, 'id' | 'createdAt' | 'updatedAt' | 'archivedAt' | 'publishedAt' | 'hiddenAt' | 'signupCount'> = {
  title: '',
  author: '',
  tags: [],
  type: 'book',
  pages: null,
  publishedDate: '',
  textUrl: '',
  description: '',
  coverUrl: null,
  whyRead: null,
  recommendationLink: null,
  readingStatus: null,
  visibility: 'hidden',
  isNew: false,
  sortOrder: 0,
  source: 'admin',
}

interface AdminBooksCatalogProps {
  participantsByBookId?: Record<string, CatalogParticipant[]>
}

export default function AdminBooksCatalog({ participantsByBookId = {} }: AdminBooksCatalogProps = {}) {
  // participantsByBookId is consumed in the new section table (stage 4); reference it here
  // so the linter does not flag it during the interim refactor.
  void participantsByBookId
  const [books, setBooks] = useState<AdminBook[]>([])
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [visFilter, setVisFilter] = useState<VisibilityFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('active')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, Partial<AdminBook>>>({})
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({ ...EMPTY_FORM })
  const [createSaving, setCreateSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function reload() {
    setLoaded(false)
    try {
      const res = await fetch(`/api/admin/books?includeArchived=1`)
      const d = await res.json()
      if (d.success && Array.isArray(d.data)) setBooks(d.data)
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => { reload() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return books.filter(b => {
      if (archiveFilter === 'active' && b.archivedAt) return false
      if (archiveFilter === 'archived' && !b.archivedAt) return false
      if (visFilter !== 'all' && b.visibility !== visFilter) return false
      if (statusFilter === 'none' && b.readingStatus) return false
      if (statusFilter === 'reading' && b.readingStatus !== 'reading') return false
      if (statusFilter === 'read' && b.readingStatus !== 'read') return false
      if (sourceFilter !== 'all' && b.source !== sourceFilter) return false
      if (q && !`${b.title} ${b.author} ${b.tags.join(' ')}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [books, search, visFilter, statusFilter, sourceFilter, archiveFilter])

  function updateEdit(id: string, field: keyof AdminBook, value: unknown) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function saveBook(id: string) {
    const patch = edits[id]
    if (!patch || Object.keys(patch).length === 0) return
    setActionLoading(id)
    setErrorMsg('')
    try {
      const body = { ...patch }
      // tags may be stored as string after edit; normalize.
      if (typeof body.tags === 'string') {
        body.tags = (body.tags as string).split(',').map(t => t.trim()).filter(Boolean)
      }
      const res = await fetch(`/api/admin/books/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) {
        setErrorMsg(d.error || 'Ошибка сохранения')
        return
      }
      setBooks(prev => prev.map(b => b.id === id ? { ...b, ...d.data, signupCount: b.signupCount } : b))
      setEdits(prev => { const next = { ...prev }; delete next[id]; return next })
    } finally {
      setActionLoading(null)
    }
  }

  async function toggleVisibility(id: string, next: 'published' | 'hidden') {
    setActionLoading(id)
    setErrorMsg('')
    try {
      const res = await fetch(`/api/admin/books/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: next }),
      })
      const d = await res.json()
      if (!res.ok) {
        setErrorMsg(d.error || 'Ошибка')
        return
      }
      setBooks(prev => prev.map(b => b.id === id ? { ...b, ...d.data, signupCount: b.signupCount } : b))
    } finally {
      setActionLoading(null)
    }
  }

  async function archiveBook(id: string, archived: boolean) {
    if (archived && !window.confirm('Архивировать книгу? Она перестанет показываться в каталоге, но запись о ней сохранится.')) return
    setActionLoading(id)
    setErrorMsg('')
    try {
      const res = await fetch(`/api/admin/books/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      })
      const d = await res.json()
      if (!res.ok) {
        setErrorMsg(d.error || 'Ошибка')
        return
      }
      setBooks(prev => prev.map(b => b.id === id ? { ...b, ...d.data, signupCount: b.signupCount } : b))
    } finally {
      setActionLoading(null)
    }
  }

  async function submitCreate() {
    if (!createForm.title.trim()) {
      setErrorMsg('Название обязательно')
      return
    }
    setCreateSaving(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/admin/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      })
      const d = await res.json()
      if (!res.ok) {
        setErrorMsg(d.error || 'Ошибка создания')
        return
      }
      setCreating(false)
      setCreateForm({ ...EMPTY_FORM })
      await reload()
      // NOTE: intentionally do NOT auto-expand the editor. The list scrolls and
      // the user clicks the row to edit. Auto-expand caused E2E flakiness because
      // the editor's "Опубликовать" testid would appear/disappear depending on whether
      // the row was clicked again to toggle.
    } finally {
      setCreateSaving(false)
    }
  }

  return (
    <div data-testid="admin-books-catalog">
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.9rem', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по названию, автору, тегам"
          aria-label="Поиск книг"
          style={{ ...fieldInput, maxWidth: 320 }}
        />
        <button onClick={() => setCreating(c => !c)} style={actionBtnStyle('#111', false)} data-testid="admin-books-create-toggle">
          {creating ? 'Отмена' : '+ Новая книга'}
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.75rem', color: '#999' }}>
          {loaded ? `${filtered.length} из ${books.length}` : 'Загрузка…'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
        {(['all', 'published', 'hidden'] as const).map(f => (
          <button key={f} onClick={() => setVisFilter(f)} style={filterBtnStyle(visFilter === f)}>
            {{ all: 'Все', published: 'Опубликованные', hidden: 'Скрытые' }[f]}
          </button>
        ))}
        <span style={{ width: '1rem' }} />
        {(['all', 'reading', 'read', 'none'] as const).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)} style={filterBtnStyle(statusFilter === f)}>
            {{ all: 'Любой статус', reading: 'Читаем', read: 'Прочитано', none: 'Без статуса' }[f]}
          </button>
        ))}
        <span style={{ width: '1rem' }} />
        {(['all', 'admin', 'submission', 'sheets_import'] as const).map(f => (
          <button key={f} onClick={() => setSourceFilter(f)} style={filterBtnStyle(sourceFilter === f)}>
            {f === 'all' ? 'Любой источник' : sourceLabel[f]}
          </button>
        ))}
        <span style={{ width: '1rem' }} />
        {(['active', 'archived', 'all'] as const).map(f => (
          <button key={f} onClick={() => setArchiveFilter(f)} style={filterBtnStyle(archiveFilter === f)}>
            {{ active: 'Активные', archived: 'Архив', all: 'Все' }[f]}
          </button>
        ))}
      </div>

      {errorMsg && (
        <p style={{ color: '#C0603A', fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.8rem' }}>
          {errorMsg}
        </p>
      )}

      {creating && (
        <CreateBookForm
          form={createForm}
          setForm={setCreateForm}
          saving={createSaving}
          onSubmit={submitCreate}
        />
      )}

      {!loaded && <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', color: '#666' }}>Загрузка…</p>}
      {loaded && filtered.length === 0 && (
        <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', color: '#999' }}>Книги не найдены</p>
      )}

      {loaded && filtered.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr>
              <th style={headCell}>Книга</th>
              <th style={headCell}>Источник</th>
              <th style={headCell}>Видимость</th>
              <th style={headCell}>Статус</th>
              <th style={{ ...headCell, textAlign: 'right' }}>Записей</th>
              <th style={headCell}>Обновлена</th>
              <th style={headCell}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(book => {
              const isSelected = selectedId === book.id
              const isActing = actionLoading === book.id
              const isArchived = !!book.archivedAt
              const e = edits[book.id] ?? {}
              const merged = { ...book, ...e }
              return (
                <Fragment key={book.id}>
                <tr data-testid={`admin-book-row-${book.id}`}>
                  <td style={{ ...cell, opacity: isArchived ? 0.5 : 1 }}>
                    <button
                      onClick={() => setSelectedId(isSelected ? null : book.id)}
                      data-testid={`admin-book-expand-${book.id}`}
                      style={{ background: 'none', border: 'none', textAlign: 'left', padding: 0, cursor: 'pointer', fontFamily: 'var(--nd-sans), system-ui, sans-serif', color: '#111', fontSize: '0.8rem' }}
                    >
                      <div style={{ fontWeight: 700 }}>{book.title}</div>
                      <div style={{ fontStyle: 'italic', color: '#666', fontSize: '0.72rem' }}>{book.author || '—'}</div>
                      {isArchived && <div style={{ fontSize: '0.65rem', color: '#C0603A', marginTop: '0.15rem' }}>В архиве</div>}
                    </button>
                  </td>
                  <td style={cell}>
                    <span style={{ color: sourceColor[book.source] ?? '#111', fontSize: '0.72rem' }}>
                      {sourceLabel[book.source] ?? book.source}
                    </span>
                  </td>
                  <td style={cell}>
                    <span style={{ color: book.visibility === 'published' ? '#2E7D32' : '#999', fontSize: '0.72rem', fontWeight: book.visibility === 'published' ? 700 : 400 }}>
                      {book.visibility === 'published' ? 'Опубликована' : 'Скрыта'}
                    </span>
                  </td>
                  <td style={{ ...cell, color: '#666', fontSize: '0.72rem' }}>
                    {book.readingStatus === 'reading' ? 'Читаем' : book.readingStatus === 'read' ? 'Прочитано' : '—'}
                    {book.isNew && <span style={{ marginLeft: '0.4rem', color: '#C0603A' }}>NEW</span>}
                  </td>
                  <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{book.signupCount}</td>
                  <td style={{ ...cell, color: '#999', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                    {new Date(book.updatedAt).toLocaleDateString('ru-RU')}
                  </td>
                  <td style={{ ...cell, textAlign: 'right', color: '#999' }}>{isSelected ? '▲' : '▼'}</td>
                </tr>
                {isSelected && (
                  <tr>
                    <td colSpan={7} style={{ padding: '1rem 0.75rem 1.25rem', background: '#FAFAFA', borderBottom: '2px solid #111' }}>
                      <BookEditor
                        book={merged}
                        original={book}
                        edits={e}
                        onChange={(field, value) => updateEdit(book.id, field, value)}
                        onSave={() => saveBook(book.id)}
                        onTogglePublish={() => toggleVisibility(book.id, book.visibility === 'published' ? 'hidden' : 'published')}
                        onArchive={() => archiveBook(book.id, !isArchived)}
                        actionLoading={isActing}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

type CreateFormShape = typeof EMPTY_FORM

function CreateBookForm({
  form, setForm, saving, onSubmit,
}: {
  form: CreateFormShape
  setForm: React.Dispatch<React.SetStateAction<CreateFormShape>>
  saving: boolean
  onSubmit: () => void
}) {
  return (
    <div style={{ border: '1px solid #111', padding: '1rem', marginBottom: '1rem', background: '#fff' }} data-testid="admin-books-create-form">
      <h3 style={{ fontFamily: 'var(--nd-serif), Georgia, serif', fontSize: '1rem', margin: '0 0 0.75rem' }}>Новая книга</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <Field label="Название *">
          <input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            style={fieldInput}
            aria-label="Название"
          />
        </Field>
        <Field label="Автор">
          <input
            value={form.author}
            onChange={e => setForm(f => ({ ...f, author: e.target.value }))}
            style={fieldInput}
          />
        </Field>
        <Field label="Теги (через запятую)">
          <input
            value={form.tags.join(', ')}
            onChange={e => setForm(f => ({ ...f, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
            style={fieldInput}
          />
        </Field>
        <Field label="Тип">
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={fieldInput} aria-label="Тип">
            <option value="book">Книга</option>
            <option value="article">Статья</option>
          </select>
        </Field>
        <Field label="Страниц">
          <input
            type="number"
            value={form.pages ?? ''}
            onChange={e => setForm(f => ({ ...f, pages: e.target.value ? parseInt(e.target.value, 10) : null }))}
            style={fieldInput}
          />
        </Field>
        <Field label="Дата публикации (текст)">
          <input value={form.publishedDate} onChange={e => setForm(f => ({ ...f, publishedDate: e.target.value }))} style={fieldInput} />
        </Field>
        <Field label="Ссылка на текст">
          <input value={form.textUrl} onChange={e => setForm(f => ({ ...f, textUrl: e.target.value }))} style={fieldInput} />
        </Field>
        <Field label="Ссылка на обложку" full>
          <input value={form.coverUrl ?? ''} onChange={e => setForm(f => ({ ...f, coverUrl: e.target.value || null }))} style={fieldInput} />
        </Field>
        <Field label="Описание" full>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} style={{ ...fieldInput, resize: 'vertical' }} />
        </Field>
        <Field label="Зачем читать" full>
          <textarea value={form.whyRead ?? ''} onChange={e => setForm(f => ({ ...f, whyRead: e.target.value || null }))} rows={3} style={{ ...fieldInput, resize: 'vertical' }} />
        </Field>
        <Field label="Ссылка на рекомендацию" full>
          <input value={form.recommendationLink ?? ''} onChange={e => setForm(f => ({ ...f, recommendationLink: e.target.value || null }))} style={fieldInput} />
        </Field>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center' }}>
        <button onClick={onSubmit} disabled={saving} style={actionBtnStyle('#111', saving)} data-testid="admin-books-create-submit">
          {saving ? 'Создание…' : 'Создать (скрыта по умолчанию)'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <div style={fieldLabel}>{label}</div>
      {children}
    </div>
  )
}

function BookEditor({
  book, original, edits, onChange, onSave, onTogglePublish, onArchive, actionLoading,
}: {
  book: AdminBook
  original: AdminBook
  edits: Partial<AdminBook>
  onChange: (field: keyof AdminBook, value: unknown) => void
  onSave: () => void
  onTogglePublish: () => void
  onArchive: () => void
  actionLoading: boolean
}) {
  const hasEdits = Object.keys(edits).length > 0
  const isArchived = !!original.archivedAt
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', maxWidth: '900px' }}>
      <Field label="Название">
        <input value={book.title} onChange={e => onChange('title', e.target.value)} style={fieldInput} />
      </Field>
      <Field label="Автор">
        <input value={book.author} onChange={e => onChange('author', e.target.value)} style={fieldInput} />
      </Field>
      <Field label="Теги (через запятую)">
        <input
          value={Array.isArray(book.tags) ? book.tags.join(', ') : ''}
          onChange={e => onChange('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
          style={fieldInput}
        />
      </Field>
      <Field label="Тип">
        <select value={book.type} onChange={e => onChange('type', e.target.value)} style={fieldInput} aria-label="Тип">
          <option value="book">Книга</option>
          <option value="article">Статья</option>
        </select>
      </Field>
      <Field label="Страниц">
        <input
          type="number"
          value={book.pages ?? ''}
          onChange={e => onChange('pages', e.target.value ? parseInt(e.target.value, 10) : null)}
          style={fieldInput}
        />
      </Field>
      <Field label="Дата публикации (текст)">
        <input value={book.publishedDate} onChange={e => onChange('publishedDate', e.target.value)} style={fieldInput} />
      </Field>
      <Field label="Ссылка на текст">
        <input value={book.textUrl} onChange={e => onChange('textUrl', e.target.value)} style={fieldInput} />
      </Field>
      <Field label="Ссылка на обложку" full>
        <input value={book.coverUrl ?? ''} onChange={e => onChange('coverUrl', e.target.value || null)} style={fieldInput} />
      </Field>
      <Field label="Описание" full>
        <textarea value={book.description} onChange={e => onChange('description', e.target.value)} rows={3} style={{ ...fieldInput, resize: 'vertical' }} />
      </Field>
      <Field label="Зачем читать" full>
        <textarea value={book.whyRead ?? ''} onChange={e => onChange('whyRead', e.target.value || null)} rows={3} style={{ ...fieldInput, resize: 'vertical' }} />
      </Field>
      <Field label="Ссылка на рекомендацию" full>
        <input value={book.recommendationLink ?? ''} onChange={e => onChange('recommendationLink', e.target.value || null)} style={fieldInput} />
      </Field>

      <Field label="Статус прочтения">
        <select
          value={book.readingStatus ?? ''}
          onChange={e => onChange('readingStatus', e.target.value || null)}
          style={fieldInput}
          aria-label="Статус прочтения"
        >
          <option value="">Без статуса</option>
          <option value="reading">Читаем</option>
          <option value="read">Прочитано</option>
        </select>
      </Field>
      <Field label="Бейдж NEW">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.8rem' }}>
          <input type="checkbox" checked={book.isNew} onChange={e => onChange('isNew', e.target.checked)} />
          Показывать «Новая»
        </label>
      </Field>
      <Field label="Порядок (sort_order)">
        <input
          type="number"
          value={book.sortOrder}
          onChange={e => onChange('sortOrder', parseInt(e.target.value, 10) || 0)}
          style={fieldInput}
        />
      </Field>

      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem', alignItems: 'center', borderTop: '1px solid #E5E5E5', paddingTop: '0.75rem' }}>
        {hasEdits && (
          <button onClick={onSave} disabled={actionLoading} style={actionBtnStyle('#111', actionLoading)} data-testid="admin-book-save">
            {actionLoading ? 'Сохранение…' : 'Сохранить'}
          </button>
        )}
        <button
          onClick={onTogglePublish}
          disabled={actionLoading || isArchived}
          style={actionBtnStyle(original.visibility === 'published' ? '#999' : '#2E7D32', actionLoading || isArchived)}
          data-testid="admin-book-toggle-publish"
        >
          {original.visibility === 'published' ? 'Скрыть' : 'Опубликовать'}
        </button>
        <span style={{ flex: 1 }} />
        <button onClick={onArchive} disabled={actionLoading} style={actionBtnStyle('#C0603A', actionLoading)} data-testid="admin-book-archive-toggle">
          {isArchived ? 'Восстановить из архива' : 'Архивировать'}
        </button>
      </div>
    </div>
  )
}
