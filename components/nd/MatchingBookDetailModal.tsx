'use client'

import { useEffect, useState } from 'react'
import CoverImage from './CoverImage'
import { getPseudonymColor, interestLabel, parseRecommendationLink } from './matching-shared'
import type { BookParticipant } from './MatchingPersonalList'

export interface MatchingBookDetail {
  bookId: string
  title: string
  author: string
  description: string
  coverUrl: string | null
  pages: number | null
  publishedDate: string
  textUrl: string
  whyRead: string | null
  recommendationLink: string | null
  tags: string[]
  personalStatus?: string | null
  isInList?: boolean
}

interface Props {
  book: MatchingBookDetail
  chips?: BookParticipant[]
  viewingUserId?: string
  frozen?: boolean
  onClose: () => void
  onStatusChange?: (bookId: string, status: string | null) => Promise<void>
  onAddToList?: (bookId: string) => Promise<void>
  onRemoveFromList?: (bookId: string) => Promise<void>
}

export default function MatchingBookDetailModal({
  book,
  chips = [],
  viewingUserId,
  frozen = true,
  onClose,
  onStatusChange,
  onAddToList,
  onRemoveFromList,
}: Props) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleAddToList() {
    if (!onAddToList) return
    setBusy(true)
    try { await onAddToList(book.bookId) } finally { setBusy(false) }
  }

  async function handleRemoveFromList() {
    if (!onRemoveFromList) return
    setBusy(true)
    try { await onRemoveFromList(book.bookId) } finally { setBusy(false) }
  }

  async function handleStatusChange(newStatus: string | null) {
    if (!onStatusChange) return
    setBusy(true)
    try { await onStatusChange(book.bookId, newStatus) } finally { setBusy(false) }
  }

  const meta: string[] = []
  if (book.publishedDate) meta.push(book.publishedDate.split('/').at(-1) ?? book.publishedDate)
  if (book.pages) meta.push(`${book.pages} стр.`)
  const parsedRecommendation = book.recommendationLink
    ? parseRecommendationLink(book.recommendationLink)
    : null
  const canEdit = !frozen && onStatusChange && onAddToList && onRemoveFromList

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(26, 23, 20, 0.42)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={book.title}
        onClick={(e) => e.stopPropagation()}
        className="relative border max-w-[720px] w-full"
        style={{
          background: 'var(--bg-input)',
          borderColor: 'var(--border)',
          borderRadius: 0,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          maxHeight: '86vh',
          overflowY: 'auto',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="absolute top-3 right-3 h-8 w-8 border text-lg leading-none"
          style={{
            borderRadius: 0,
            borderColor: 'var(--border)',
            background: 'var(--bg-input)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          ×
        </button>

        <div className="px-6 py-5 pr-14 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3
            className="m-0 text-xl font-semibold leading-tight"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif', color: 'var(--text)' }}
          >
            {book.title}
          </h3>
        </div>

        <div className="grid gap-6 p-6" style={{ gridTemplateColumns: '140px minmax(0, 1fr)' }}>
          <div className="relative rounded overflow-hidden shrink-0" style={{ width: 140, height: 210 }}>
            <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
          </div>

          <div className="min-w-0">
            <p className="text-base m-0 mb-2" style={{ color: 'var(--text-secondary)' }}>
              {book.author}{meta.length > 0 ? ` · ${meta.join(' · ')}` : ''}
            </p>

            {book.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {book.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] uppercase px-2 py-0.5 border"
                    style={{
                      color: 'var(--text-muted)',
                      borderColor: '#d6d6d6',
                      background: 'transparent',
                      borderRadius: 0,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {book.description && (
              <p
                className="text-sm leading-relaxed mb-5"
                style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}
              >
                {book.description}
              </p>
            )}

            {book.whyRead && (
              <section
                className="mb-5 border-l-2 px-4 py-3"
                style={{ borderColor: 'var(--accent)', background: 'var(--bg-elevated)' }}
              >
                <h4 className="m-0 mb-2 text-xs uppercase" style={{ color: 'var(--accent)' }}>
                  Почему предлагаю читать
                </h4>
                <p className="m-0 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>
                  {book.whyRead}
                </p>
              </section>
            )}

            {(book.textUrl || parsedRecommendation) && (
              <div className="flex flex-wrap gap-3 mb-5 text-sm">
                {book.textUrl && (
                  <a href={book.textUrl} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--text)' }}>
                    Текст
                  </a>
                )}
                {parsedRecommendation && (
                  <a href={parsedRecommendation.url} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--text)' }}>
                    {parsedRecommendation.text}
                  </a>
                )}
              </div>
            )}

            {chips.length > 0 && (
              <div className="mb-5">
                <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                  Записались на книгу:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {chips.map((p) => {
                    const colors = getPseudonymColor(p.pseudonym)
                    const isMe = p.userId === viewingUserId
                    const label = interestLabel(p.rank, p.personalStatus)
                    const rankStr = p.rank != null ? ` #${p.rank}` : ''
                    return (
                      <span
                        key={p.userId}
                        className={`inline-flex items-center px-2 py-0.5 text-[11px] ${colors.chip} ${isMe ? 'ring-1 ring-current' : ''}`}
                        style={{ borderRadius: 0 }}
                        title={isMe ? 'Это вы' : undefined}
                      >
                        {p.pseudonym} · {label}{rankStr}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {book.isInList && canEdit && (
              <div className="mb-4">
                <select
                  aria-label="Статус книги"
                  value={book.personalStatus ?? ''}
                  onChange={(e) => handleStatusChange(e.target.value || null)}
                  disabled={busy}
                  className="w-full text-sm border px-3 py-2 cursor-pointer"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text)',
                    borderRadius: 0,
                  }}
                >
                  <option value="">Записал:ась</option>
                  <option value="reading">Читаю сейчас</option>
                  <option value="read">Прочитал:а</option>
                </select>
              </div>
            )}

            {canEdit && (
              <div className="flex gap-2">
                {book.isInList ? (
                  <button
                    onClick={handleRemoveFromList}
                    disabled={busy}
                    className="flex-1 text-sm py-2 px-3 border"
                    style={{
                      borderRadius: 0,
                      borderColor: 'var(--border)',
                      background: 'var(--bg-input)',
                      color: 'var(--text-secondary)',
                      cursor: busy ? 'default' : 'pointer',
                    }}
                  >
                    {busy ? '…' : 'Убрать из списка'}
                  </button>
                ) : (
                  <button
                    onClick={handleAddToList}
                    disabled={busy}
                    className="flex-1 text-sm py-2 px-3 font-medium"
                    style={{
                      borderRadius: 0,
                      border: '1px solid var(--border-strong)',
                      background: 'var(--text)',
                      color: 'var(--bg)',
                      cursor: busy ? 'default' : 'pointer',
                      opacity: busy ? 0.7 : 1,
                    }}
                  >
                    {busy ? '…' : 'Добавить в список'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
