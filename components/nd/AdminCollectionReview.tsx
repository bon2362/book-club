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

interface Detail {
  collection: SerializedCollection
  books: EditorBook[]
  diff: CollectionDiff | null
}

interface Props {
  id: string
  onChanged: () => void
}

const box: React.CSSProperties = { border: '1px solid var(--border)', margin: '16px 0' }
const boxHead: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '9px 13px',
  background: 'var(--bg-elevated)',
  borderBottom: '1px solid var(--border)',
}
const eyebrow: React.CSSProperties = { fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)' }
const line: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', padding: '9px 13px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }
const mark: React.CSSProperties = { fontFamily: 'var(--nd-mono)', fontSize: 12, width: 14, flexShrink: 0 }
const note: React.CSSProperties = { marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }

function Cover({ book, dim = false }: { book: EditorBook | undefined; dim?: boolean }) {
  if (!book) return null
  return (
    <span style={{ position: 'relative', width: 22, aspectRatio: '2 / 3', overflow: 'hidden', opacity: dim ? 0.45 : 1, flex: 'none' }}>
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
        <ins style={{ background: 'var(--bg-tag-green)', color: 'var(--text)', textDecoration: 'none' }}>{after}</ins>
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
    const response = await fetch(`/api/admin/collections/${id}`)
    if (response.ok) setDetail(await response.json())
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function runAction(action: AdminCollectionAction, reason?: string) {
    setIssues([])
    const response = await fetch(`/api/admin/collections/${id}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reason === undefined ? { action } : { action, reason }),
    })
    const body = await response.json()
    if (!response.ok) {
      setIssues(Array.isArray(body.issues) ? body.issues : [body.error ?? 'collections_failed'])
      return
    }
    setReasonKind(null)
    await load()
    onChanged()
  }

  async function remove() {
    if (!window.confirm('Удалить подборку? Ссылки на неё перестанут работать.')) return
    const response = await fetch(`/api/admin/collections/${id}`, { method: 'DELETE' })
    if (response.ok) onChanged()
  }

  if (!detail) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Загружаю…</div>

  const { collection, books, diff } = detail
  const booksById = new Map(books.map((book) => [book.id, book]))
  const isChanged = collection.status === 'published'
    && diff !== null
    && collection.editedAt !== null
    && (!collection.reviewedAt || new Date(collection.editedAt).getTime() > new Date(collection.reviewedAt).getTime())

  if (editing) {
    return (
      <CollectionEditor
        mode="admin"
        initial={collection}
        initialBooks={books.filter((book) => collection.bookIds.includes(book.id))}
        onSaved={async () => {
          setEditing(false)
          await load()
          onChanged()
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  let statusTitle: string
  if (collection.status === 'pending') statusTitle = 'НОВАЯ — ЖДЁТ ПРОВЕРКИ'
  else if (isChanged) statusTitle = 'ИЗМЕНЕНА ПОСЛЕ ПРОВЕРКИ'
  else statusTitle = COLLECTION_STATUS_LABEL[collection.status].toUpperCase()

  const eventAt = collection.status === 'pending'
    ? collection.submittedAt ?? collection.updatedAt
    : collection.editedAt ?? collection.updatedAt
  const reasonPrefix = COLLECTION_REASON_PREFIX[collection.status]

  return (
    <div data-testid="admin-collection-review">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <span
            style={{
              fontSize: '0.6rem',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: collection.status === 'pending' || isChanged ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: '1px solid currentColor',
              paddingBottom: 2,
            }}
          >
            {statusTitle}
          </span>
          <h2 style={{ fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: 24, lineHeight: 1.15, margin: '9px 0 0' }}>
            {collection.title}
          </h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <AuthorAvatar name={collection.displayName || '?'} size={24} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {collection.displayName || '—'} · {formatChangedAt(new Date(eventAt), new Date()).absolute}
            </span>
          </div>
        </div>
        <a
          className="p-btn ghost sm"
          href={`/collections/${collection.slug ?? collection.id}`}
          target="_blank"
          rel="noreferrer"
        >
          Открыть как читатель
        </a>
      </div>

      {reasonPrefix && collection.moderationReason && (
        <div style={{ marginTop: 14, borderLeft: '2px solid var(--accent)', paddingLeft: 11, fontSize: 12, lineHeight: 1.55 }}>
          <b style={{ fontWeight: 500 }}>{reasonPrefix}</b> {collection.moderationReason}
        </div>
      )}

      {isChanged && diff ? (
        <>
          <div style={{ marginTop: 20, marginBottom: 4 }}>
            <span style={eyebrow}>Что изменилось с прошлой проверки</span>
          </div>

          <div style={box}>
            <div style={boxHead}>
              <span style={eyebrow}>Состав</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>порядок — не повод для проверки</span>
            </div>
            {diff.added.map((bookId) => (
              <div key={`added-${bookId}`} data-testid="diff-added" style={line}>
                <span style={{ ...mark, color: 'var(--success)' }}>+</span>
                <Cover book={booksById.get(bookId)} />
                <span>{booksById.get(bookId)?.title ?? bookId}</span>
                <span style={note}>добавлена</span>
              </div>
            ))}
            {diff.removed.map((bookId) => (
              <div key={`removed-${bookId}`} data-testid="diff-removed" style={{ ...line, color: 'var(--text-muted)' }}>
                <span style={{ ...mark, color: 'var(--accent)' }}>−</span>
                <Cover book={booksById.get(bookId)} dim />
                <span style={{ textDecoration: 'line-through' }}>{booksById.get(bookId)?.title ?? bookId}</span>
                <span style={note}>убрана</span>
              </div>
            ))}
            {diff.moved.map((move) => (
              <div key={`moved-${move.bookId}`} data-testid="diff-moved" style={line}>
                <span style={{ ...mark, color: 'var(--text-secondary)' }}>↕</span>
                <Cover book={booksById.get(move.bookId)} />
                <span>{booksById.get(move.bookId)?.title ?? move.bookId}</span>
                <span style={note}>{move.from} → {move.to}</span>
              </div>
            ))}
            {diff.added.length + diff.removed.length + diff.moved.length === 0 && (
              <div style={{ ...line, color: 'var(--text-muted)' }}>Состав без изменений</div>
            )}
          </div>

          {diff.title && <TextChange label="Название" before={diff.title.before} after={diff.title.after} />}
          {diff.displayName && <TextChange label="Подпись" before={diff.displayName.before} after={diff.displayName.after} />}
          {diff.description ? (
            <TextChange label="Описание" before={diff.description.before} after={diff.description.after} />
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12 }}>
              <b style={{ fontWeight: 500, color: 'var(--text)' }}>Описание</b> — без изменений
            </div>
          )}
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
              const book = booksById.get(bookId)
              return (
                <div key={bookId} style={line}>
                  <span style={{ ...mark, color: 'var(--text-muted)' }}>{index + 1}</span>
                  <Cover book={book} />
                  <span>
                    {book?.title ?? bookId}
                    {book?.hiddenFromCatalog && <span style={{ color: 'var(--accent)' }}> · скрыта из каталога</span>}
                  </span>
                  <span style={note}>{book?.author}</span>
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
        <CollectionReasonSheet
          kind={reasonKind}
          onSubmit={(reason) => runAction(reasonKind, reason)}
          onCancel={() => setReasonKind(null)}
        />
      ) : (
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
            paddingTop: 16,
            borderTop: '1px solid var(--border)',
            marginTop: 18,
          }}
        >
          {collection.status === 'pending' && (
            <>
              <button type="button" className="p-btn sm" onClick={() => runAction('publish')}>Опубликовать</button>
              <button type="button" className="p-btn ghost sm" onClick={() => setReasonKind('reject')}>Отклонить с причиной</button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>После публикации подборка появится на главной и в списке.</span>
            </>
          )}
          {isChanged && (
            <>
              <button type="button" className="p-btn sm" onClick={() => runAction('mark_reviewed')}>Правка проверена</button>
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
            <button type="button" className="p-btn sm" onClick={() => runAction('unhide')}>Вернуть в публикацию</button>
          )}
          {(collection.status === 'hidden' || collection.status === 'rejected') && (
            <button type="button" className="p-btn ghost sm" onClick={() => setEditing(true)}>Править</button>
          )}
          {collection.status !== 'pending' && (
            <button
              type="button"
              onClick={remove}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--accent)' }}
            >
              Удалить
            </button>
          )}
        </div>
      )}
    </div>
  )
}
