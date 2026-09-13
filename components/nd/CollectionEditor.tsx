'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CollectionSnapshot, EditorBook, SerializedCollection } from '@/lib/collections/types'
import { COLLECTION_LIMITS } from '@/lib/collections/types'
import { collectionIssueText, textsCount } from '@/lib/collections/format'
import { track } from '@/lib/analytics'
import MarkdownToolbar from './MarkdownToolbar'
import CoverImage from './CoverImage'
import CollectionBookSearch from './CollectionBookSearch'
import { useCollectionAutosave } from './useCollectionAutosave'
import { COLLECTION_REASON_PREFIX, COLLECTION_STATUS_LABEL } from './collection-status'

interface Props {
  mode: 'author' | 'admin'
  initial: SerializedCollection | null
  initialBooks: EditorBook[]
  onSaved?: (collection: SerializedCollection) => void
  onCancel?: () => void
}

const labelRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 7 }
const labelText: React.CSSProperties = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text)' }
const hint: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }
const field: React.CSSProperties = { marginBottom: 20 }

function contentOf(title: string, descriptionMarkdown: string, displayName: string, books: EditorBook[]): CollectionSnapshot {
  return { title, descriptionMarkdown, displayName, bookIds: books.map((book) => book.id) }
}

function clubNote(book: EditorBook): string {
  if (book.clubStatus === 'read') return ' · клуб уже читал'
  if (book.clubStatus === 'reading') return ' · клуб читает сейчас'
  return ''
}

function issuesFrom(body: { issues?: unknown; error?: unknown }): string[] {
  if (Array.isArray(body.issues)) return body.issues.filter((issue): issue is string => typeof issue === 'string')
  return [typeof body.error === 'string' ? body.error : 'collections_failed']
}

export default function CollectionEditor({ mode, initial, initialBooks, onSaved, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.descriptionMarkdown ?? '')
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '')
  const [books, setBooks] = useState<EditorBook[]>(initialBooks)
  // Последнее сохранённое на сервере состояние — для «Отменить правки» и признака несохранённых правок.
  const [savedBooks, setSavedBooks] = useState<EditorBook[]>(initialBooks)
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify(contentOf(initial?.title ?? '', initial?.descriptionMarkdown ?? '', initial?.displayName ?? '', initialBooks)))
  const [serverIssues, setServerIssues] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const status = initial?.status ?? 'draft'
  const isPublished = status === 'published'
  const autosaveEnabled = mode === 'author' && !isPublished
  const content = useMemo(() => contentOf(title, description, displayName, books), [title, description, displayName, books])
  const dirty = JSON.stringify(content) !== baseline

  const handleCreated = useCallback((id: string) => {
    // replaceState, а не router.replace: смена маршрута перемонтировала бы редактор и сбросила ввод.
    window.history.replaceState(null, '', `/collections/${id}/edit`)
    track('collection_created', { collection_id: id })
  }, [])

  const autosave = useCollectionAutosave({
    initialId: initial?.id ?? null,
    content,
    enabled: autosaveEnabled,
    onCreated: handleCreated,
  })
  const collectionId = autosave.id

  // Правки опубликованной подборки живут только в форме до «Опубликовать правки» — предупреждаем при уходе.
  useEffect(() => {
    if (autosaveEnabled || !dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [autosaveEnabled, dirty])

  const publicCount = books.filter((book) => !book.hiddenFromCatalog).length
  const canSubmit = Boolean(collectionId)
    && title.trim() !== ''
    && description.trim() !== ''
    && displayName.trim() !== ''
    && publicCount >= COLLECTION_LIMITS.booksMinToSubmit
    && autosave.state !== 'saving'
    && !busy
  const issues = Array.from(new Set([...autosave.issues, ...serverIssues]))
  const reasonPrefix = COLLECTION_REASON_PREFIX[status]

  function move(index: number, delta: -1 | 1) {
    setBooks((current) => {
      const target = index + delta
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function cancelEdits() {
    const saved = JSON.parse(baseline) as CollectionSnapshot
    setTitle(saved.title)
    setDescription(saved.descriptionMarkdown)
    setDisplayName(saved.displayName)
    setBooks(savedBooks)
    setServerIssues([])
    onCancel?.()
  }

  async function saveExplicitly() {
    if (!collectionId) return
    setBusy(true)
    setServerIssues([])
    try {
      const url = mode === 'admin' ? `/api/admin/collections/${collectionId}` : `/api/me/collections/${collectionId}`
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(content),
      })
      const body = await response.json()
      if (!response.ok) {
        setServerIssues(issuesFrom(body))
        return
      }
      setBaseline(JSON.stringify(content))
      setSavedBooks(books)
      if (mode === 'author') track('collection_edits_published', { collection_id: collectionId })
      onSaved?.(body.collection)
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (!collectionId) return
    setBusy(true)
    setServerIssues([])
    try {
      await autosave.flush()
      const response = await fetch(`/api/me/collections/${collectionId}/submit`, { method: 'POST' })
      const body = await response.json()
      if (!response.ok) {
        setServerIssues(issuesFrom(body))
        return
      }
      track('collection_submitted', { collection_id: collectionId, source: 'editor' })
      window.location.assign(`/collections/${collectionId}`)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!collectionId || !window.confirm('Удалить подборку? Это нельзя отменить.')) return
    const response = await fetch(`/api/me/collections/${collectionId}`, { method: 'DELETE' })
    if (response.ok) {
      window.location.assign('/collections')
      return
    }
    setServerIssues(issuesFrom(await response.json().catch(() => ({}))))
  }

  let stateLine: string
  if (mode === 'admin') {
    stateLine = `${COLLECTION_STATUS_LABEL[status]} · правка владельцем`
  } else if (isPublished) {
    stateLine = 'Опубликована — правки уходят на сайт без проверки'
  } else {
    stateLine = `${COLLECTION_STATUS_LABEL[status]} · сохраняется автоматически`
  }

  const saveStateText = { idle: '', saving: 'Сохраняю…', saved: 'Сохранено', error: 'Не сохранено' }[autosave.state]

  return (
    <main
      className="collection-editor"
      style={{ maxWidth: 880, margin: '0 auto', padding: mode === 'admin' ? 0 : '24px 26px 60px' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          paddingBottom: 16,
          borderBottom: '1px solid var(--border)',
          marginBottom: 22,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)' }}>
            {initial ? 'Правка подборки' : 'Новая подборка'}
          </span>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            {stateLine}
            {autosaveEnabled && (
              <span data-testid="collection-save-state" style={{ marginLeft: 8 }}>{saveStateText}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {mode === 'author' && collectionId && (
            <a className="p-btn ghost sm" href={`/collections/${collectionId}`}>Посмотреть</a>
          )}
          {mode === 'author' && !isPublished && (
            <button type="button" className="p-btn sm" onClick={submit} disabled={!canSubmit}>
              Отправить на проверку
            </button>
          )}
          {(mode === 'admin' || isPublished) && (
            <>
              <button type="button" className="p-btn ghost sm" onClick={cancelEdits} disabled={busy || (mode === 'author' && !dirty)}>
                {mode === 'admin' ? 'Отмена' : 'Отменить правки'}
              </button>
              <button type="button" className="p-btn sm" onClick={saveExplicitly} disabled={!dirty || busy}>
                {mode === 'admin' ? 'Сохранить' : 'Опубликовать правки'}
              </button>
            </>
          )}
        </div>
      </div>

      {mode === 'author' && reasonPrefix && initial?.moderationReason && (
        <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 11, marginBottom: 18, fontSize: 12, lineHeight: 1.55, color: 'var(--text-body)' }}>
          <b style={{ fontWeight: 500 }}>{reasonPrefix}</b> {initial.moderationReason}
        </div>
      )}

      {issues.length > 0 && (
        <div
          data-testid="collection-editor-issues"
          style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 10, marginBottom: 18, fontSize: 12, color: 'var(--text-body)' }}
        >
          {issues.map((issue) => <div key={issue}>{collectionIssueText(issue)}</div>)}
        </div>
      )}

      <div style={field}>
        <div style={labelRow}>
          <label htmlFor="collection-title" style={labelText}>Название</label>
          <span style={hint}>{title.length} / {COLLECTION_LIMITS.titleMax}</span>
        </div>
        <input
          id="collection-title"
          className="collection-title-input"
          value={title}
          maxLength={COLLECTION_LIMITS.titleMax}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="О чём эта подборка в трёх словах"
          style={{
            width: '100%',
            fontFamily: 'var(--nd-serif)',
            fontWeight: 700,
            fontSize: 26,
            color: 'var(--text)',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--border)',
            padding: '6px 0',
            outline: 'none',
          }}
        />
      </div>

      <div style={field}>
        <div style={labelRow}>
          <label htmlFor="collection-description" style={labelText}>Описание</label>
        </div>
        <MarkdownToolbar textareaRef={textareaRef} value={description} onChange={setDescription} />
        <textarea
          id="collection-description"
          ref={textareaRef}
          value={description}
          maxLength={COLLECTION_LIMITS.descriptionMax}
          onChange={(event) => setDescription(event.target.value)}
          rows={6}
          style={{
            width: '100%',
            minHeight: 110,
            marginTop: 7,
            fontFamily: 'var(--nd-serif)',
            fontSize: 15,
            lineHeight: 1.6,
            color: 'var(--text-body)',
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            borderBottom: '2px solid var(--border-strong)',
            padding: 11,
            outline: 'none',
            resize: 'vertical',
          }}
        />
        <div style={hint}>
          Зачем вы это собрали и как это читать. Можно списками, выделением и ссылками. Начало описания попадёт в превью ссылки в Telegram.
        </div>
      </div>

      <div style={field}>
        <div style={labelRow}>
          <label htmlFor="collection-display-name" style={labelText}>Подпись</label>
        </div>
        <input
          id="collection-display-name"
          value={displayName}
          maxLength={COLLECTION_LIMITS.displayNameMax}
          onChange={(event) => setDisplayName(event.target.value)}
          style={{
            width: '100%',
            maxWidth: 320,
            fontFamily: 'var(--nd-sans)',
            fontSize: 14,
            color: 'var(--text)',
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            borderBottom: '2px solid var(--border-strong)',
            padding: '10px 12px',
            outline: 'none',
          }}
        />
        <div style={hint}>Как вас подписать на странице подборки</div>
      </div>

      <div style={{ ...field, marginTop: 30 }}>
        <div style={labelRow}>
          <span style={labelText}>Тексты · {books.length}</span>
          {publicCount < COLLECTION_LIMITS.booksMinToSubmit && <span style={hint}>нужно минимум два</span>}
        </div>

        {books.length < COLLECTION_LIMITS.booksMax && (
          <CollectionBookSearch
            excludeIds={new Set(books.map((book) => book.id))}
            onAdd={(book) => setBooks((current) => [...current, { ...book, hiddenFromCatalog: false }])}
          />
        )}

        {books.length === 0 && (
          <div style={{ border: '1px dashed var(--border)', padding: '30px 22px', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
            Пока пусто. Найдите книги, которые уже выбрали в каталоге.
          </div>
        )}

        {books.map((book, index) => (
          <div
            key={book.id}
            data-testid="collection-book-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '26px 44px 1fr auto',
              gap: 12,
              alignItems: 'center',
              padding: '11px 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
              <button
                type="button"
                aria-label="Выше"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                style={{ width: 22, height: 18, border: '1px solid var(--border)', background: 'var(--bg-input)', fontSize: 9, color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                ▲
              </button>
              <button
                type="button"
                aria-label="Ниже"
                disabled={index === books.length - 1}
                onClick={() => move(index, 1)}
                style={{ width: 22, height: 18, border: '1px solid var(--border)', background: 'var(--bg-input)', fontSize: 9, color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                ▼
              </button>
            </div>
            <div style={{ position: 'relative', width: 44, aspectRatio: '2 / 3', overflow: 'hidden' }}>
              <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
              <span style={{ fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: 15 }}>{book.title}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {book.author}
                {book.year ? `, ${book.year}` : ''}
                {clubNote(book)}
                {book.hiddenFromCatalog && <span style={{ color: 'var(--accent)' }}> · скрыта из каталога</span>}
              </span>
            </div>
            <button
              type="button"
              className="p-link muted"
              onClick={() => setBooks((current) => current.filter((item) => item.id !== book.id))}
            >
              Убрать
            </button>
          </div>
        ))}
        {books.length > 0 && <div style={hint}>{textsCount(books.length)}</div>}
      </div>

      {mode === 'author' && !isPublished && collectionId && (
        <div style={{ display: 'flex', paddingTop: 16, borderTop: '1px solid var(--border)', marginTop: 18 }}>
          <button
            type="button"
            onClick={remove}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: 'var(--accent)' }}
          >
            Удалить подборку
          </button>
        </div>
      )}
    </main>
  )
}
