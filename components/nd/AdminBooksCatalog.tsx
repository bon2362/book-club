'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

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
  source: 'admin' | 'submission'
  publishedAt: string | null
  hiddenAt: string | null
  createdAt: string
  updatedAt: string
  signupCount: number
  submittedByName: string | null
  submittedByEmail: string | null
}

type StatusFilter = 'all' | 'reading' | 'read' | 'none'
type SourceFilter = 'all' | 'admin' | 'submission'
type SortKey = 'sortOrder' | 'title' | 'signups' | 'participants'
type SortState = { key: SortKey; dir: 'asc' | 'desc' }

const SANS = 'var(--nd-sans), system-ui, -apple-system, sans-serif'
const SERIF = 'var(--nd-serif), Georgia, serif'
const MONO = 'var(--nd-mono), ui-monospace, Menlo, monospace'

const TOP_PRIORITY_EMOJI = ['🏆', '🥈', '🥉']

const EMPTY_FORM: Omit<
  AdminBook,
  'id' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'hiddenAt' | 'signupCount' | 'submittedByName' | 'submittedByEmail'
> = {
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

// ─────────────────────────── module-level SWR-style cache ───────────────────────────
// Survives mount/unmount of <AdminBooksCatalog> so switching tabs returns instantly.
const catalogCache: { data: AdminBook[] | null; lastAt: string | null } = {
  data: null,
  lastAt: null,
}

function nowHHMM(): string {
  return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
}

function initials(author: string): string {
  return (author || '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

// ─────────────────────────── small atoms ───────────────────────────
const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  fontFamily: SANS,
  fontSize: '0.82rem',
  color: 'var(--text)',
  borderTop: '1px solid var(--border)',
  borderRight: '1px solid #E5E5E5',
  borderLeft: '1px solid var(--border)',
  borderBottom: '2px solid var(--border-strong)',
  padding: '0.38rem 0.55rem',
  outline: 'none',
  background: 'var(--bg-input)',
  boxSizing: 'border-box',
}

const headBase: React.CSSProperties = {
  fontFamily: SANS,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-secondary)',
  borderBottom: '2px solid var(--border-strong)',
  textAlign: 'left',
  userSelect: 'none',
  padding: '0.55rem 0.75rem',
  fontSize: '0.62rem',
}

const cellBase: React.CSSProperties = {
  fontFamily: SANS,
  color: 'var(--text)',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'middle',
  padding: '0.5rem 0.75rem',
}

function Cover({ book }: { book: AdminBook }) {
  const [err, setErr] = useState(false)
  return (
    <div
      style={{
        width: 34,
        height: 50,
        flex: '0 0 34px',
        border: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {book.coverUrl && !err ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={book.coverUrl}
          alt=""
          onError={() => setErr(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <span style={{ fontFamily: SANS, fontSize: '0.6rem', color: 'var(--text-muted)' }}>
          {initials(book.author) || '—'}
        </span>
      )}
    </div>
  )
}

function Chip({
  children,
  bg,
  fg,
  border,
}: {
  children: React.ReactNode
  bg: string
  fg: string
  border?: string
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.08rem 0.42rem',
        borderRadius: 2,
        background: bg,
        color: fg,
        border: border ? `1px solid ${border}` : 'none',
        fontFamily: SANS,
        fontSize: '0.6rem',
        fontWeight: 700,
        lineHeight: 1.4,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function StatusChips({ book }: { book: AdminBook }) {
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
      {book.isNew && (
        <Chip bg="#C0603A" fg="#fff">
          New
        </Chip>
      )}
      {book.readingStatus === 'reading' && (
        <Chip bg="#fff" fg="#C0603A" border="#C0603A">
          Reading
        </Chip>
      )}
      {book.readingStatus === 'read' && (
        <Chip bg="#fff" fg="#2E7D32" border="#2E7D32">
          Read
        </Chip>
      )}
      {book.source === 'submission' && (
        <Chip bg="#F0EAE2" fg="#7A4A1F">
          Заявка
        </Chip>
      )}
    </span>
  )
}

function Participants({ participants }: { participants: CatalogParticipant[] }) {
  if (!participants || participants.length === 0) {
    return <span style={{ color: 'var(--border)' }}>—</span>
  }
  return (
    <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', lineHeight: 1.55 }}>
      {participants.map((p, i) => (
        <span key={p.userId}>
          {i > 0 && ', '}
          {p.name}
          {p.rank !== null && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginLeft: 3, whiteSpace: 'nowrap' }}>
              ({TOP_PRIORITY_EMOJI[p.rank - 1] ? `${TOP_PRIORITY_EMOJI[p.rank - 1]} ` : ''}#{p.rank})
            </span>
          )}
        </span>
      ))}
    </span>
  )
}

function SortTh({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
  disabled,
  style,
}: {
  label: string
  sortKey: SortKey
  sort: SortState
  onSort: (key: SortKey) => void
  align?: 'left' | 'right' | 'center'
  disabled?: boolean
  style?: React.CSSProperties
}) {
  const active = sort.key === sortKey
  const arrow = active ? (sort.dir === 'asc' ? '↑' : '↓') : ''
  return (
    <th
      onClick={() => !disabled && onSort(sortKey)}
      style={{
        ...headBase,
        textAlign: align,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
        <span>{label}</span>
        {active && <span aria-hidden>{arrow}</span>}
      </span>
    </th>
  )
}

function CopyableId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(id)
        } catch {
          /* ignore */
        }
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      title="Скопировать ID"
      style={{
        fontFamily: MONO,
        fontSize: '0.72rem',
        padding: '0.18rem 0.4rem',
        border: '1px solid var(--border)',
        borderRadius: 2,
        background: '#F8F6F2',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
      }}
    >
      {id} {copied ? '✓' : '⧉'}
    </button>
  )
}

function ReadOnlyField({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <div
        style={{
          fontFamily: SANS,
          fontSize: '0.62rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
          marginBottom: '0.2rem',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: mono ? MONO : SANS,
          fontSize: '0.78rem',
          color: 'var(--text-secondary)',
          background: '#F2EFE9',
          border: '1px solid var(--border)',
          padding: '0.32rem 0.5rem',
          minHeight: '1.5rem',
        }}
      >
        {value || '—'}
      </div>
    </div>
  )
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <div
        style={{
          fontFamily: SANS,
          fontSize: '0.62rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-secondary)',
          marginBottom: '0.2rem',
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

function VisibilityToggle({
  value,
  onChange,
  disabled,
}: {
  value: 'published' | 'hidden'
  onChange: (v: 'published' | 'hidden') => void
  disabled?: boolean
}) {
  const isPublished = value === 'published'
  return (
    <button
      type="button"
      data-testid="admin-book-toggle-publish"
      onClick={() => !disabled && onChange(isPublished ? 'hidden' : 'published')}
      role="switch"
      aria-checked={isPublished}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.55rem',
        padding: '0.3rem 0.55rem',
        background: 'transparent',
        border: `1px solid ${isPublished ? '#2E7D32' : 'var(--text-muted)'}`,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: SANS,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        style={{
          position: 'relative',
          display: 'inline-block',
          width: 34,
          height: 18,
          background: isPublished ? '#2E7D32' : 'var(--border)',
          borderRadius: 999,
          transition: 'background 0.15s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: isPublished ? 18 : 2,
            width: 14,
            height: 14,
            background: 'var(--bg-input)',
            borderRadius: '50%',
            transition: 'left 0.15s',
          }}
        />
      </span>
      <span
        style={{
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 700,
          color: isPublished ? '#2E7D32' : 'var(--text-secondary)',
        }}
      >
        {isPublished ? 'Опубликована' : 'Скрыта'}
      </span>
    </button>
  )
}

function NewBadgeToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!value)}
      role="switch"
      aria-checked={!!value}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.55rem',
        padding: '0.3rem 0.55rem',
        background: 'transparent',
        border: `1px solid ${value ? 'var(--accent)' : 'var(--text-muted)'}`,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: SANS,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        style={{
          position: 'relative',
          display: 'inline-block',
          width: 34,
          height: 18,
          background: value ? 'var(--accent)' : 'var(--border)',
          borderRadius: 999,
          transition: 'background 0.15s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: value ? 18 : 2,
            width: 14,
            height: 14,
            background: 'var(--bg-input)',
            borderRadius: '50%',
            transition: 'left 0.15s',
          }}
        />
      </span>
      <span
        style={{
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 700,
          color: value ? 'var(--accent)' : 'var(--text-secondary)',
        }}
      >
        NEW
      </span>
    </button>
  )
}

function ReadingStatusSegmented({
  value,
  onChange,
  disabled,
}: {
  value: string | null
  onChange: (v: string | null) => void
  disabled?: boolean
}) {
  const opts: { v: string | null; label: string; color: string }[] = [
    { v: null, label: 'Без статуса', color: 'var(--text-secondary)' },
    { v: 'reading', label: 'Reading', color: 'var(--accent)' },
    { v: 'read', label: 'Read', color: '#2E7D32' },
  ]
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--text-muted)' }}>
      {opts.map((o, i) => {
        const active = (value ?? null) === o.v
        return (
          <button
            key={o.label}
            type="button"
            onClick={() => !disabled && onChange(o.v)}
            disabled={disabled}
            style={{
              fontFamily: SANS,
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '0.32rem 0.7rem',
              border: 'none',
              borderLeft: i > 0 ? '1px solid #999' : 'none',
              background: active ? o.color : 'transparent',
              color: active ? '#fff' : 'var(--text-secondary)',
              fontWeight: active ? 700 : 400,
              cursor: disabled ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minHeight: 36 }}>
      <span
        style={{
          fontFamily: SANS,
          fontSize: '0.62rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
          width: 110,
          flex: '0 0 110px',
        }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

// ─────────────────────────── book editor ───────────────────────────
function autoHeight(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

function BookEditor({
  book,
  hasEdits,
  saving,
  onChange,
  onSave,
}: {
  book: AdminBook
  hasEdits: boolean
  saving: boolean
  onChange: (field: keyof AdminBook, value: unknown) => void
  onSave: () => void
}) {
  // Auto-adjust all textareas when editor opens or book switches
  const editorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    editorRef.current?.querySelectorAll('textarea').forEach(autoHeight)
  }, [book.id])
  return (
    <div ref={editorRef} style={{ padding: '1rem 1rem 1.25rem', background: 'var(--bg)', borderBottom: '2px solid var(--border-strong)' }}>
      {/* State panel */}
      <div
        style={{
          border: '1px solid #DDD2BE',
          background: '#FFFCF6',
          padding: '0.75rem 0.9rem 0.9rem',
          marginBottom: '1rem',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -8,
            left: 14,
            background: 'var(--bg)',
            padding: '0 0.45rem',
            fontFamily: SANS,
            fontSize: '0.6rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-muted)',
          }}
        >
          Состояние
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          <ControlRow label="ID">
            <CopyableId id={book.id} />
          </ControlRow>
          <ControlRow label="Видимость">
            <VisibilityToggle value={book.visibility} onChange={v => onChange('visibility', v)} />
          </ControlRow>
          <ControlRow label="Статус">
            <ReadingStatusSegmented value={book.readingStatus} onChange={v => onChange('readingStatus', v)} />
          </ControlRow>
          <ControlRow label="Бейдж">
            <NewBadgeToggle value={book.isNew} onChange={v => onChange('isNew', v)} />
          </ControlRow>
        </div>
      </div>

      {/* Editable fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <Field label="Название">
          <input value={book.title} onChange={e => onChange('title', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Автор">
          <input value={book.author} onChange={e => onChange('author', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Теги (через запятую)">
          <input
            value={Array.isArray(book.tags) ? book.tags.join(', ') : ''}
            onChange={e => onChange('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
            style={inputStyle}
          />
        </Field>
        <Field label="Тип">
          <select value={book.type} onChange={e => onChange('type', e.target.value)} style={inputStyle} aria-label="Тип">
            <option value="book">Книга</option>
            <option value="article">Статья</option>
          </select>
        </Field>
        <Field label="Страниц">
          <input
            type="number"
            value={book.pages ?? ''}
            onChange={e => onChange('pages', e.target.value ? parseInt(e.target.value, 10) : null)}
            style={inputStyle}
          />
        </Field>
        <Field label="Дата публикации (текст)">
          <input value={book.publishedDate || ''} onChange={e => onChange('publishedDate', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Ссылка на текст" full>
          <input value={book.textUrl || ''} onChange={e => onChange('textUrl', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Ссылка на обложку" full>
          <input
            value={book.coverUrl || ''}
            onChange={e => onChange('coverUrl', e.target.value || null)}
            style={inputStyle}
          />
        </Field>
        <Field label="Описание" full>
          <textarea
            value={book.description || ''}
            onChange={e => onChange('description', e.target.value)}
            onInput={e => autoHeight(e.currentTarget)}
            style={{ ...inputStyle, resize: 'none', overflow: 'hidden', minHeight: '4.5rem' }}
          />
        </Field>
        <Field label="Зачем читать" full>
          <textarea
            value={book.whyRead || ''}
            onChange={e => onChange('whyRead', e.target.value || null)}
            onInput={e => autoHeight(e.currentTarget)}
            style={{ ...inputStyle, resize: 'none', overflow: 'hidden', minHeight: '4.5rem' }}
          />
        </Field>
        <Field label="Ссылка на рекомендацию" full>
          <input
            value={book.recommendationLink || ''}
            onChange={e => onChange('recommendationLink', e.target.value || null)}
            style={inputStyle}
          />
        </Field>
      </div>

      {/* Read-only system fields */}
      <div style={{ marginTop: '1rem', paddingTop: '0.9rem', borderTop: '1px dashed var(--border)' }}>
        <div
          style={{
            fontFamily: SANS,
            fontSize: '0.62rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-muted)',
            marginBottom: '0.55rem',
          }}
        >
          Системные поля · read-only
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.55rem' }}>
          <ReadOnlyField
            label="Источник"
            value={
              book.source === 'admin'
                ? 'Админ'
                : book.source === 'submission'
                  ? 'Заявка'
                  : book.source
            }
          />
          <ReadOnlyField label="Created at" value={formatDateTime(book.createdAt)} />
          <ReadOnlyField label="Updated at" value={formatDateTime(book.updatedAt)} />
          <ReadOnlyField label="Published at" value={formatDateTime(book.publishedAt)} />
          <ReadOnlyField label="Hidden at" value={formatDateTime(book.hiddenAt)} />
          {book.source === 'submission' && (
            <ReadOnlyField
              label="Загрузил"
              value={book.submittedByName ?? book.submittedByEmail ?? '—'}
            />
          )}
        </div>
      </div>

      {/* Save action */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginTop: '1rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--border)',
        }}
      >
        {hasEdits ? (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            data-testid="admin-book-save"
            style={{
              fontFamily: SANS,
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '0.4rem 0.85rem',
              border: '1px solid var(--border-strong)',
              background: saving ? 'var(--text-secondary)' : '#111',
              color: 'var(--bg)',
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        ) : (
          <span style={{ fontFamily: SANS, fontSize: '0.72rem', color: 'var(--text-muted)' }}>Нет несохранённых изменений</span>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────── row (draggable wrapper) ───────────────────────────
function SortableRow({
  book,
  position,
  expanded,
  allowDnD,
  participants,
  onToggleExpand,
  editorElement,
}: {
  book: AdminBook
  position: number
  expanded: boolean
  allowDnD: boolean
  participants: CatalogParticipant[]
  onToggleExpand: () => void
  editorElement: React.ReactNode | null
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: book.id,
    disabled: !allowDnD,
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: isDragging ? '#FFF8EE' : expanded ? '#FAF8F4' : 'transparent',
  }
  return (
    <Fragment>
      <tr ref={setNodeRef} style={style} data-testid={`admin-book-row-${book.id}`}>
        <td style={{ ...cellBase, width: 32, textAlign: 'center' }}>
          {allowDnD ? (
            <span
              {...attributes}
              {...listeners}
              aria-label="Перетащить"
              title="Перетащить"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 22,
                color: 'var(--text)',
                cursor: 'grab',
                fontSize: '1rem',
                lineHeight: 1,
                touchAction: 'none',
              }}
            >
              ⋮⋮
            </span>
          ) : (
            <span style={{ fontFamily: MONO, fontSize: '0.72rem', color: 'var(--text-muted)' }}>{position}</span>
          )}
        </td>
        <td style={{ ...cellBase, width: 50 }}>
          <Cover book={book} />
        </td>
        <td style={cellBase}>
          <button
            type="button"
            data-testid={`admin-book-expand-${book.id}`}
            onClick={onToggleExpand}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              textAlign: 'left',
              cursor: 'pointer',
              fontFamily: SANS,
              color: 'var(--text)',
              display: 'block',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem' }}>
              <div
                style={{
                  flex: '1 1 auto',
                  minWidth: 0,
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  textDecoration: expanded ? 'underline' : 'none',
                  textUnderlineOffset: 3,
                  lineHeight: 1.35,
                }}
              >
                {book.title}
                {/* legacy textual status string kept for e2e compatibility */}
                <span style={{ display: 'none' }}>
                  {book.visibility === 'published' ? 'Опубликована' : 'Скрыта'}
                </span>
              </div>
              <div
                style={{
                  flex: '0 0 auto',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.25rem',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  paddingTop: 2,
                }}
              >
                <StatusChips book={book} />
              </div>
            </div>
            <div style={{ fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: '0.72rem', marginTop: '0.12rem' }}>
              {book.author || 'Автор не указан'}
            </div>
          </button>
        </td>
        <td
          style={{
            ...cellBase,
            textAlign: 'right',
            fontWeight: 700,
            width: 70,
            color: book.signupCount > 0 ? '#111' : 'var(--text-muted)',
          }}
        >
          {book.signupCount}
        </td>
        <td style={{ ...cellBase, color: 'var(--text-secondary)', maxWidth: 420 }}>
          <Participants participants={participants} />
        </td>
      </tr>
      {expanded && editorElement && (
        <tr style={{ background: 'var(--bg)' }} data-testid={`admin-book-editor-${book.id}`}>
          <td colSpan={5} style={{ padding: 0 }}>
            {editorElement}
          </td>
        </tr>
      )}
    </Fragment>
  )
}

// ─────────────────────────── section table ───────────────────────────
function SectionTable({
  title,
  subtitle,
  sectionId,
  books,
  allowDnD,
  reorderMode,
  sort,
  onSort,
  selectedId,
  onToggleExpand,
  participantsByBookId,
  renderEditor,
  onReorder,
  defaultOpen = true,
}: {
  title: string
  subtitle: string
  sectionId: string
  books: AdminBook[]
  allowDnD: boolean
  reorderMode: boolean
  sort: SortState
  onSort: (key: SortKey) => void
  selectedId: string | null
  onToggleExpand: (id: string) => void
  participantsByBookId: Record<string, CatalogParticipant[]>
  renderEditor: (book: AdminBook) => React.ReactNode
  onReorder?: (orderedIds: string[]) => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function handleDragEnd(e: DragEndEvent) {
    if (!allowDnD || !onReorder) return
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = books.map(b => b.id)
    const fromIdx = ids.indexOf(String(active.id))
    const toIdx = ids.indexOf(String(over.id))
    if (fromIdx < 0 || toIdx < 0) return
    const next = arrayMove(ids, fromIdx, toIdx)
    onReorder(next)
  }

  const effectiveSort: SortState = reorderMode ? { key: 'sortOrder', dir: 'asc' } : sort

  return (
    <section style={{ marginBottom: '2rem' }} data-section={sectionId} data-testid={`admin-catalog-section-${sectionId}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.6rem',
          background: 'none',
          border: 'none',
          padding: '0 0 0.55rem 0',
          cursor: 'pointer',
          fontFamily: SERIF,
          color: 'var(--text)',
          width: '100%',
        }}
        aria-expanded={open}
      >
        <h2 style={{ margin: 0, fontFamily: SERIF, fontWeight: 700, fontSize: '1.05rem' }}>
          {title} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({books.length})</span>
        </h2>
        <span style={{ fontFamily: SANS, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{subtitle}</span>
        <span style={{ marginLeft: 'auto', fontFamily: SANS, fontSize: '0.78rem', color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
          <thead>
            <tr>
              <SortTh
                label="№"
                sortKey="sortOrder"
                sort={effectiveSort}
                onSort={onSort}
                disabled={reorderMode}
                align="center"
                style={{ width: 32 }}
              />
              <th style={{ ...headBase }}>Обложка</th>
              <SortTh label="Книга" sortKey="title" sort={effectiveSort} onSort={onSort} disabled={reorderMode} />
              <SortTh
                label="Записей"
                sortKey="signups"
                sort={effectiveSort}
                onSort={onSort}
                disabled={reorderMode}
                align="right"
                style={{ width: 90 }}
              />
              <SortTh label="Участники" sortKey="participants" sort={effectiveSort} onSort={onSort} disabled={reorderMode} />
            </tr>
          </thead>
          <tbody>
            {books.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ ...cellBase, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Пусто
                </td>
              </tr>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={books.map(b => b.id)} strategy={verticalListSortingStrategy}>
                  {books.map((b, idx) => (
                    <SortableRow
                      key={b.id}
                      book={b}
                      position={idx + 1}
                      expanded={selectedId === b.id}
                      allowDnD={allowDnD}
                      participants={participantsByBookId[b.id] ?? []}
                      onToggleExpand={() => onToggleExpand(b.id)}
                      editorElement={selectedId === b.id ? renderEditor(b) : null}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </tbody>
        </table>
      )}
    </section>
  )
}

// ─────────────────────────── create form ───────────────────────────
type CreateFormShape = typeof EMPTY_FORM

function CreateBookForm({
  form,
  setForm,
  saving,
  onSubmit,
}: {
  form: CreateFormShape
  setForm: React.Dispatch<React.SetStateAction<CreateFormShape>>
  saving: boolean
  onSubmit: () => void
}) {
  return (
    <div
      style={{ border: '1px solid var(--border-strong)', padding: '1rem', marginBottom: '1rem', background: 'var(--bg-input)' }}
      data-testid="admin-books-create-form"
    >
      <h3 style={{ fontFamily: SERIF, fontSize: '1rem', margin: '0 0 0.75rem' }}>Новая книга</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <Field label="Название *">
          <input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            style={inputStyle}
            aria-label="Название"
          />
        </Field>
        <Field label="Автор">
          <input
            value={form.author}
            onChange={e => setForm(f => ({ ...f, author: e.target.value }))}
            style={inputStyle}
          />
        </Field>
        <Field label="Теги (через запятую)">
          <input
            value={form.tags.join(', ')}
            onChange={e =>
              setForm(f => ({ ...f, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))
            }
            style={inputStyle}
          />
        </Field>
        <Field label="Тип">
          <select
            value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            style={inputStyle}
            aria-label="Тип"
          >
            <option value="book">Книга</option>
            <option value="article">Статья</option>
          </select>
        </Field>
        <Field label="Страниц">
          <input
            type="number"
            value={form.pages ?? ''}
            onChange={e => setForm(f => ({ ...f, pages: e.target.value ? parseInt(e.target.value, 10) : null }))}
            style={inputStyle}
          />
        </Field>
        <Field label="Дата публикации (текст)">
          <input value={form.publishedDate} onChange={e => setForm(f => ({ ...f, publishedDate: e.target.value }))} style={inputStyle} />
        </Field>
        <Field label="Ссылка на текст" full>
          <input value={form.textUrl} onChange={e => setForm(f => ({ ...f, textUrl: e.target.value }))} style={inputStyle} />
        </Field>
        <Field label="Ссылка на обложку" full>
          <input
            value={form.coverUrl ?? ''}
            onChange={e => setForm(f => ({ ...f, coverUrl: e.target.value || null }))}
            style={inputStyle}
          />
        </Field>
        <Field label="Описание" full>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>
        <Field label="Зачем читать" full>
          <textarea
            value={form.whyRead ?? ''}
            onChange={e => setForm(f => ({ ...f, whyRead: e.target.value || null }))}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>
        <Field label="Ссылка на рекомендацию" full>
          <input
            value={form.recommendationLink ?? ''}
            onChange={e => setForm(f => ({ ...f, recommendationLink: e.target.value || null }))}
            style={inputStyle}
          />
        </Field>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center' }}>
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          data-testid="admin-books-create-submit"
          style={{
            fontFamily: SANS,
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            padding: '0.4rem 0.85rem',
            border: '1px solid var(--border-strong)',
            background: saving ? 'var(--text-secondary)' : '#111',
            color: 'var(--bg)',
            cursor: saving ? 'default' : 'pointer',
          }}
        >
          {saving ? 'Создание…' : 'Создать (скрыта по умолчанию)'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────── main component ───────────────────────────
interface AdminBooksCatalogProps {
  participantsByBookId?: Record<string, CatalogParticipant[]>
}

export default function AdminBooksCatalog({ participantsByBookId = {} }: AdminBooksCatalogProps = {}) {
  // SWR-style: hydrate from module cache, then silent revalidate.
  const [books, setBooks] = useState<AdminBook[]>(catalogCache.data ?? [])
  const [loading, setLoading] = useState(!catalogCache.data)
  const [refreshing, setRefreshing] = useState(false)
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(catalogCache.lastAt)
  const [errorMsg, setErrorMsg] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [reorderMode, setReorderMode] = useState(false)
  const [sortPublished, setSortPublished] = useState<SortState>({ key: 'signups', dir: 'desc' })
  const [sortHidden, setSortHidden] = useState<SortState>({ key: 'title', dir: 'asc' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, Partial<AdminBook>>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({ ...EMPTY_FORM })
  const [createSaving, setCreateSaving] = useState(false)

  const editsRef = useRef(edits)
  editsRef.current = edits

  const revalidate = useCallback(async (silent: boolean) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await fetch('/api/admin/books')
      const d = await res.json()
      if (d.success && Array.isArray(d.data)) {
        catalogCache.data = d.data
        catalogCache.lastAt = nowHHMM()
        setBooks(d.data)
        setLastFetchedAt(catalogCache.lastAt)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    revalidate(!!catalogCache.data)
  }, [revalidate])

  function applyBookUpdate(id: string, patch: Partial<AdminBook>) {
    setBooks(prev => {
      const next = prev.map(b => (b.id === id ? { ...b, ...patch, signupCount: b.signupCount } : b))
      catalogCache.data = next
      return next
    })
  }

  function updateEdit(id: string, field: keyof AdminBook, value: unknown) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  function clearEdits(id: string) {
    setEdits(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  function hasUnsavedEdits(id: string | null): boolean {
    if (!id) return false
    const e = editsRef.current[id]
    return !!e && Object.keys(e).length > 0
  }

  function confirmClose(): boolean {
    return window.confirm('Закрыть без сохранения?')
  }

  function handleToggleExpand(id: string) {
    if (selectedId === id) {
      // Closing the currently-open editor
      if (hasUnsavedEdits(id) && !confirmClose()) return
      clearEdits(id)
      setSelectedId(null)
      return
    }
    // Switching to a different editor
    if (selectedId && hasUnsavedEdits(selectedId) && !confirmClose()) return
    if (selectedId) clearEdits(selectedId)
    setSelectedId(id)
  }

  async function saveBook(id: string) {
    const patch = edits[id]
    if (!patch || Object.keys(patch).length === 0) return
    setSaving(id)
    setErrorMsg('')
    try {
      const res = await fetch(`/api/admin/books/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const d = await res.json()
      if (!res.ok) {
        setErrorMsg(d.error || 'Ошибка сохранения')
        return
      }
      applyBookUpdate(id, d.data)
      clearEdits(id)
    } finally {
      setSaving(null)
    }
  }

  async function patchBook(id: string, patch: Partial<AdminBook> & Record<string, unknown>) {
    // Optimistic — apply locally first, rollback on failure.
    const prev = books.find(b => b.id === id)
    if (!prev) return
    applyBookUpdate(id, patch)
    setErrorMsg('')
    try {
      const res = await fetch(`/api/admin/books/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const d = await res.json()
      if (!res.ok) {
        setErrorMsg(d.error || 'Ошибка')
        // rollback
        applyBookUpdate(id, prev)
        return
      }
      applyBookUpdate(id, d.data)
    } catch {
      applyBookUpdate(id, prev)
      setErrorMsg('Ошибка сети')
    }
  }

  function handleInlineEditorChange(id: string, field: keyof AdminBook, value: unknown) {
    // Toggles in the state panel (visibility, readingStatus, isNew) are
    // optimistic + immediate PATCH, not staged edits.
    if (field === 'visibility' || field === 'readingStatus' || field === 'isNew') {
      patchBook(id, { [field]: value } as Partial<AdminBook>)
      return
    }
    updateEdit(id, field, value)
  }

  async function handleReorder(orderedIds: string[]) {
    // Optimistic: update sortOrder locally first.
    const orderMap = new Map(orderedIds.map((id, i) => [id, i + 1]))
    const snapshot = books
    setBooks(prev => {
      const next = prev.map(b => {
        const so = orderMap.get(b.id)
        return so != null ? { ...b, sortOrder: so } : b
      })
      catalogCache.data = next
      return next
    })
    try {
      const res = await fetch('/api/admin/books/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: orderedIds }),
      })
      if (!res.ok) {
        setBooks(snapshot)
        catalogCache.data = snapshot
        setErrorMsg('Ошибка изменения порядка')
      }
    } catch {
      setBooks(snapshot)
      catalogCache.data = snapshot
      setErrorMsg('Ошибка сети при изменении порядка')
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
      await revalidate(true)
    } finally {
      setCreateSaving(false)
    }
  }

  // ─── filtering ───
  const q = search.trim().toLowerCase()
  const matches = (b: AdminBook): boolean => {
    if (q && !`${b.title} ${b.author} ${(b.tags || []).join(' ')}`.toLowerCase().includes(q)) return false
    if (statusFilter === 'reading' && b.readingStatus !== 'reading') return false
    if (statusFilter === 'read' && b.readingStatus !== 'read') return false
    if (statusFilter === 'none' && b.readingStatus) return false
    if (sourceFilter === 'admin' && b.source !== 'admin') return false
    if (sourceFilter === 'submission' && b.source !== 'submission') return false
    return true
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allFiltered = useMemo(() => books.filter(matches), [books, q, statusFilter, sourceFilter])

  const sortFn = (sort: SortState) => (a: AdminBook, b: AdminBook) => {
    const dir = sort.dir === 'asc' ? 1 : -1
    const val = (book: AdminBook): string | number => {
      switch (sort.key) {
        case 'title':
          return book.title.toLowerCase()
        case 'signups':
          return book.signupCount
        case 'participants':
          return (participantsByBookId[book.id] ?? []).length
        case 'sortOrder':
          return book.sortOrder
        default:
          return book.title.toLowerCase()
      }
    }
    const av = val(a)
    const bv = val(b)
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    return String(av).localeCompare(String(bv), 'ru') * dir
  }

  const published = useMemo(
    () =>
      allFiltered
        .filter(b => b.visibility === 'published')
        .sort(reorderMode ? sortFn({ key: 'sortOrder', dir: 'asc' }) : sortFn(sortPublished)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFiltered, reorderMode, sortPublished, participantsByBookId],
  )
  const hidden = useMemo(
    () => allFiltered.filter(b => b.visibility === 'hidden').sort(sortFn(sortHidden)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFiltered, sortHidden, participantsByBookId],
  )
  function makeSorter(setter: React.Dispatch<React.SetStateAction<SortState>>) {
    return (key: SortKey) =>
      setter(prev =>
        prev.key === key
          ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
          : { key, dir: key === 'signups' || key === 'sortOrder' ? 'desc' : 'asc' },
      )
  }

  function renderEditor(b: AdminBook): React.ReactNode {
    const merged: AdminBook = { ...b, ...edits[b.id] }
    const hasEdits = !!edits[b.id] && Object.keys(edits[b.id] ?? {}).length > 0
    return (
      <BookEditor
        book={merged}
        hasEdits={hasEdits}
        saving={saving === b.id}
        onChange={(field, value) => handleInlineEditorChange(b.id, field, value)}
        onSave={() => saveBook(b.id)}
      />
    )
  }

  return (
    <div data-testid="admin-books-catalog" style={{ fontFamily: SANS }}>
      {/* Top controls */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.7rem' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по названию, автору, тегам"
          aria-label="Поиск книг"
          style={{ ...inputStyle, width: 320, flex: '0 0 320px' }}
        />
        <button
          type="button"
          data-testid="admin-books-create-toggle"
          onClick={() => setCreating(c => !c)}
          style={{
            fontFamily: SANS,
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            padding: '0.38rem 0.85rem',
            border: '1px solid var(--border-strong)',
            background: 'transparent',
            color: 'var(--text)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {creating ? 'Отмена' : '+ Новая книга'}
        </button>
        <button
          type="button"
          data-testid="admin-books-reorder-toggle"
          onClick={() => setReorderMode(m => !m)}
          style={{
            fontFamily: SANS,
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            padding: '0.38rem 0.85rem',
            cursor: 'pointer',
            border: `1px solid ${reorderMode ? 'var(--accent)' : 'var(--text-muted)'}`,
            background: reorderMode ? 'var(--accent)' : 'transparent',
            color: reorderMode ? '#fff' : 'var(--text-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
          {reorderMode ? '✓ Режим перестановки' : '⇅ Режим перестановки'}
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: SANS, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {allFiltered.length} из {books.length}
          {lastFetchedAt && ` · обновлено в ${lastFetchedAt}`}
          {refreshing && ' (обновляется…)'}
        </span>
      </div>

      {!reorderMode && (
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
          {([
            ['all', 'Любой статус'],
            ['reading', 'Читаем'],
            ['read', 'Прочитано'],
            ['none', 'Без статуса'],
          ] as [StatusFilter, string][]).map(([k, l]) => (
            <FilterPill key={k} active={statusFilter === k} onClick={() => setStatusFilter(k)}>
              {l}
            </FilterPill>
          ))}
          <span style={{ width: '0.8rem' }} />
          {([
            ['all', 'Все источники'],
            ['admin', 'Админ'],
            ['submission', 'Заявки'],
          ] as [SourceFilter, string][]).map(([k, l]) => (
            <FilterPill key={k} active={sourceFilter === k} onClick={() => setSourceFilter(k)}>
              {l}
            </FilterPill>
          ))}
        </div>
      )}

      {reorderMode && (
        <div
          style={{
            fontFamily: SANS,
            fontSize: '0.72rem',
            color: '#7A4A1F',
            background: '#F0EAE2',
            border: '1px solid #D8C8B6',
            padding: '0.5rem 0.75rem',
            marginBottom: '0.9rem',
          }}
        >
          Режим перестановки: сортировка зафиксирована на «№». Тащите строки за <span style={{ color: 'var(--text)' }}>⋮⋮</span>, чтобы изменить порядок. Только опубликованные книги.
        </div>
      )}

      {errorMsg && (
        <p style={{ color: 'var(--accent)', fontFamily: SANS, fontSize: '0.8rem' }}>{errorMsg}</p>
      )}

      {creating && (
        <CreateBookForm form={createForm} setForm={setCreateForm} saving={createSaving} onSubmit={submitCreate} />
      )}

      {loading && <p style={{ fontFamily: SANS, color: 'var(--text-secondary)' }}>Загрузка…</p>}

      {!loading && (
        <Fragment>
          <SectionTable
            title="Опубликованные"
            subtitle="видны участникам в каталоге"
            sectionId="published"
            books={published}
            allowDnD={reorderMode}
            reorderMode={reorderMode}
            sort={sortPublished}
            onSort={makeSorter(setSortPublished)}
            selectedId={selectedId}
            onToggleExpand={handleToggleExpand}
            participantsByBookId={participantsByBookId}
            renderEditor={renderEditor}
            onReorder={handleReorder}
          />
          <SectionTable
            title="Не опубликованные"
            subtitle="добавлены, но скрыты от участников"
            sectionId="hidden"
            books={hidden}
            allowDnD={false}
            reorderMode={false}
            sort={sortHidden}
            onSort={makeSorter(setSortHidden)}
            selectedId={selectedId}
            onToggleExpand={handleToggleExpand}
            participantsByBookId={participantsByBookId}
            renderEditor={renderEditor}
          />
        </Fragment>
      )}
    </div>
  )
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: SANS,
        fontSize: '0.65rem',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        padding: '0.25rem 0.55rem',
        border: '1px solid #999',
        background: active ? '#111' : 'transparent',
        color: active ? '#fff' : 'var(--text-secondary)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}
