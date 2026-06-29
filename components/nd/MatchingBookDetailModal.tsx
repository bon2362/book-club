'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import CoverImage from './CoverImage'
import { parseRecommendationLink, withAdminName } from './matching-shared'
import type { BookParticipant } from './MatchingPersonalList'
import ParticipantInterestChip from './ParticipantInterestChip'

export interface MatchingBookDetail {
  bookId: string
  bookSlug?: string | null
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

type SummaryState = {
  id: string
  status: 'draft' | 'pending' | 'published' | 'rejected'
} | null

interface Props {
  book: MatchingBookDetail
  chips?: BookParticipant[]
  viewingUserId?: string
  frozen?: boolean
  onClose: () => void
  onStatusChange?: (bookId: string, status: string | null) => Promise<void>
  onAddToList?: (bookId: string) => Promise<void>
  onRemoveFromList?: (bookId: string) => Promise<void>
  /** Карта displayName → name; задаётся только для админа (#341). */
  adminNamesByDisplayName?: Map<string, string | null> | null
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
  adminNamesByDisplayName = null,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<SummaryState>(null)
  const [summaryLoaded, setSummaryLoaded] = useState(false)
  const [summaryBusy, setSummaryBusy] = useState(false)
  const friendlyBookRef = book.bookSlug ?? book.bookId
  const summaryEditHref = book.bookSlug
    ? `/books/${book.bookSlug}/my-summary/edit`
    : summary ? `/summaries/${summary.id}/edit` : ''

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    setSummary(null)
    setSummaryLoaded(false)
    if (book.personalStatus !== 'read') return

    fetch(`/api/summaries/by-book/${book.bookId}`)
      .then(res => res.ok ? res.json() : { summary: null })
      .then(data => {
        if (!cancelled) {
          setSummary(data.summary ?? null)
          setSummaryLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) setSummaryLoaded(true)
      })

    return () => { cancelled = true }
  }, [book.bookId, book.personalStatus])

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

  async function handleWriteSummary() {
    setSummaryBusy(true)
    try {
      const res = await fetch(`/api/summaries/by-book/${book.bookId}`, { method: 'POST' })
      if (!res.ok) return
      const data = await res.json()
      if (data.summary?.id) window.location.href = `/summaries/${data.summary.id}/edit`
    } finally {
      setSummaryBusy(false)
    }
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
      className="fixed inset-0 flex items-center justify-center z-50 p-6"
      style={{ background: 'rgba(33, 28, 23, 0.34)', backdropFilter: 'blur(2px)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={book.title}
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-[640px] w-full"
        style={{
          background: 'var(--bg-input)',
          borderRadius: 'var(--radius-card)',
          boxShadow: '0 24px 70px rgba(33,28,23,0.25)',
          maxHeight: '88vh',
          overflowY: 'auto',
        }}
      >
        {/* Close button: soft round */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="absolute top-4 right-4 flex items-center justify-center"
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: 'none',
            background: 'var(--chip-bg)',
            color: 'var(--text-secondary)',
            fontSize: '1.05rem',
            cursor: 'pointer',
            lineHeight: 1,
            zIndex: 1,
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'var(--hair)' }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'var(--chip-bg)' }}
        >
          ×
        </button>

        {/* Top: cover + title/author/tags — no separate header with border */}
        <div
          className="grid gap-6"
          style={{ gridTemplateColumns: '132px minmax(0,1fr)', padding: '1.9rem 1.9rem 0' }}
        >
          <div
            className="relative overflow-hidden shrink-0"
            style={{ width: 132, height: 198, borderRadius: 6, boxShadow: '0 4px 16px rgba(40,30,20,0.18)' }}
          >
            <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
          </div>

          <div style={{ paddingTop: '0.1rem', paddingRight: '2rem' }}>
            <h3
              className="leading-tight"
              style={{
                margin: '0 0 0.4rem',
                fontFamily: 'var(--nd-serif)',
                fontWeight: 700,
                fontSize: '1.55rem',
                letterSpacing: '-0.01em',
                color: 'var(--text)',
                lineHeight: 1.15,
              }}
            >
              {book.title}
            </h3>
            <p style={{ margin: '0 0 0.85rem', fontSize: '0.92rem', color: 'var(--text-muted)' }}>
              {book.author}{meta.length > 0 ? ` · ${meta.join(' · ')}` : ''}
            </p>

            {/* п.7: «Кто записался» поднято наверх — первое, что видит человек */}
            {chips.length > 0 && (
              <div style={{ marginBottom: '0.85rem' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  Записались на книгу:
                </div>
                <div className="flex flex-wrap" style={{ gap: '0.3rem 0' }}>
                  {chips.map((p) => (
                    <ParticipantInterestChip
                      key={p.userId}
                      userId={p.userId}
                      displayName={withAdminName(p.displayName, adminNamesByDisplayName)}
                      rank={p.rank}
                      personalStatus={p.personalStatus}
                      viewingUserId={viewingUserId}
                    />
                  ))}
                </div>
              </div>
            )}

            {book.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {book.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: '0.72rem',
                      padding: '0.16rem 0.6rem',
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--chip-bg)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem 1.9rem 1.9rem' }}>
          {book.description && (
            <p
              style={{ margin: '0 0 1.5rem', fontSize: '0.92rem', lineHeight: 1.68, color: 'var(--text-body)', whiteSpace: 'pre-line' }}
            >
              {book.description}
            </p>
          )}

          {book.whyRead && (
            <section
              style={{
                margin: '0 0 1.5rem',
                paddingLeft: '1rem',
                borderLeft: '3px solid var(--accent)',
              }}
            >
              <h4
                style={{ margin: '0 0 0.35rem', fontSize: '0.72rem', textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--accent)' }}
              >
                Почему предлагаю читать
              </h4>
              <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.62, color: 'var(--text-body)', whiteSpace: 'pre-line' }}>
                {book.whyRead}
              </p>
            </section>
          )}

          {(book.textUrl || parsedRecommendation) && (
            <div className="flex flex-wrap gap-4 mb-6" style={{ fontSize: '0.88rem' }}>
              {book.textUrl && (
                <a
                  href={book.textUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.textDecoration = 'underline' }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.textDecoration = 'none' }}
                >
                  Текст →
                </a>
              )}
              {parsedRecommendation && (
                <a
                  href={parsedRecommendation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.textDecoration = 'underline' }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.textDecoration = 'none' }}
                >
                  {parsedRecommendation.text} →
                </a>
              )}
            </div>
          )}

          {book.isInList && canEdit && (
            <div style={{ marginBottom: '1rem' }}>
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
                  borderRadius: 'var(--radius-control)',
                }}
              >
                <option value="">Записал:ась</option>
                <option value="reading">Читаю сейчас</option>
                <option value="read">Прочитал:а</option>
              </select>
            </div>
          )}

          {book.personalStatus === 'read' && summaryLoaded && (
            <div style={{ margin: '0 0 1rem' }}>
              {!summary && (
                <button
                  type="button"
                  onClick={handleWriteSummary}
                  disabled={summaryBusy}
                  style={{
                    width: '100%',
                    border: 'none',
                    background: 'var(--accent)',
                    color: 'var(--bg-input)',
                    borderRadius: 'var(--radius-control)',
                    padding: '0.75rem 0.9rem',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: summaryBusy ? 'default' : 'pointer',
                  }}
                >
                  {summaryBusy ? 'Открываем…' : '✦ Написать саммари'}
                </button>
              )}
              {summary?.status === 'draft' && (
                <a href={summaryEditHref} style={summaryLinkStyle}>Продолжить саммари</a>
              )}
              {summary?.status === 'rejected' && (
                <a href={summaryEditHref} style={summaryLinkStyle}>Доработать саммари</a>
              )}
              {summary?.status === 'pending' && (
                <div style={summaryDisabledStyle}>Саммари на проверке</div>
              )}
              {summary?.status === 'published' && (
                <div style={{ display: 'grid', gap: '0.45rem' }}>
                  <a href={`/books/${friendlyBookRef}/summaries`} style={summaryLinkStyle}>Читать саммари</a>
                  <a
                    href={summaryEditHref}
                    style={{
                      ...summaryLinkStyle,
                      background: 'transparent',
                      color: 'var(--text)',
                      border: '1px solid var(--border-strong)',
                    }}
                  >
                    Редактировать
                  </a>
                </div>
              )}
              <p style={{ margin: '0.45rem 0 0', fontSize: '0.76rem', lineHeight: 1.45, color: 'var(--text-muted)' }}>
                Саммари проходит проверку администратора перед публикацией.
              </p>
            </div>
          )}

          {canEdit && (
            <div className="flex gap-3 items-center">
              {book.isInList ? (
                <button
                  onClick={handleRemoveFromList}
                  disabled={busy}
                  style={{
                    fontSize: '0.85rem',
                    padding: 0,
                    border: 'none',
                    background: 'none',
                    color: 'var(--text-muted)',
                    cursor: busy ? 'default' : 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {busy ? '…' : 'Убрать из списка'}
                </button>
              ) : (
                <button
                  onClick={handleAddToList}
                  disabled={busy}
                  style={{
                    background: 'var(--accent)',
                    border: 'none',
                    color: 'var(--bg-input)',
                    padding: '0.6rem 1.3rem',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-control)',
                    cursor: busy ? 'default' : 'pointer',
                    opacity: busy ? 0.7 : 1,
                  }}
                  onMouseEnter={(e) => { if (!busy) (e.target as HTMLElement).style.background = 'var(--accent-hover)' }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'var(--accent)' }}
                >
                  {busy ? '…' : 'Добавить в список'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const summaryLinkStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'center',
  border: 'none',
  background: 'var(--accent)',
  color: 'var(--bg-input)',
  borderRadius: 'var(--radius-control)',
  padding: '0.75rem 0.9rem',
  fontSize: '0.9rem',
  fontWeight: 700,
  textDecoration: 'none',
}

const summaryDisabledStyle: CSSProperties = {
  ...summaryLinkStyle,
  background: 'var(--chip-bg)',
  color: 'var(--text-secondary)',
}
