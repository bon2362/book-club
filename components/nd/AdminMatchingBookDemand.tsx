'use client'

import type {
  CoordinationBook,
  CoordinationParticipantStatus,
} from '@/lib/matching/coordination-radar'
import { TOP_RANK_LIMIT } from '@/lib/matching/coordination-radar'
import { focusRing, hintText, quietText } from './admin-matching-shared'

// Read-only радар: только картина группового спроса. Никаких действий и подсказок, кому что писать.

const STATUS_LABEL: Record<CoordinationParticipantStatus, string> = {
  assigned: 'в круге',
  signed_up: 'записался',
  conditional: 'авто-запись',
  wishlist: 'в списке',
}

const STATUS_COLOR: Record<CoordinationParticipantStatus, string> = {
  assigned: 'var(--success)',
  signed_up: 'var(--text)',
  conditional: 'var(--accent)',
  wishlist: 'var(--text-muted)',
}

export const EMPTY_DEMAND_TEXT = 'Пока нет книг с тремя активными пересечениями'

function formatRank(rank: number | null): string {
  return rank === null ? '—' : `#${rank}`
}

function formatAverage(value: number | null): string {
  return value === null ? '—' : value.toFixed(1).replace('.', ',')
}

function MetricsTooltip({ id, book }: { id: string; book: CoordinationBook }) {
  const rows: Array<[string, string | number]> = [
    ['Средний ранг', formatAverage(book.avgRank)],
    ['Худший ранг', formatRank(book.worstRank)],
    ['Без ранга', book.unrankedCount],
    ['Записались', book.hardCount],
    ['Авто-запись', book.conditionalCount],
    ['В круге', book.assignedCount],
  ]
  return (
    <span
      id={id}
      role="tooltip"
      className="hidden group-hover:flex group-focus-visible:flex"
      style={{
        position: 'absolute',
        left: 0,
        top: 'calc(100% + 2px)',
        zIndex: 5,
        flexDirection: 'column',
        gap: 1,
        minWidth: 190,
        padding: '8px 10px',
        background: 'var(--bg-input)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius)',
      }}
    >
      {rows.map(([label, value]) => (
        <span key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          <span>{label}</span>
          <span style={{ fontFamily: 'var(--nd-mono)', color: 'var(--text)' }}>{value}</span>
        </span>
      ))}
    </span>
  )
}

function BookDemandCard({ book }: { book: CoordinationBook }) {
  const tooltipId = `admin-demand-metrics-${book.bookId}`
  const aggregates = [
    `в списках: ${book.interestedCount}`,
    `в топ-${TOP_RANK_LIMIT}: ${book.topThreeCount}`,
    `средний ранг: ${formatAverage(book.avgRank)}`,
  ].join(' · ')

  return (
    <article
      data-testid="admin-demand-book"
      data-book-id={book.bookId}
      style={{ borderTop: '1px solid var(--border-strong)', paddingTop: 6 }}
    >
      <div
        tabIndex={0}
        aria-describedby={tooltipId}
        className={`group ${focusRing}`}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.5rem',
          flexWrap: 'wrap',
          width: 'fit-content',
          maxWidth: '100%',
        }}
      >
        <h4 style={{ fontFamily: 'var(--nd-serif)', fontSize: '0.98rem', fontWeight: 400, lineHeight: 1.25, margin: '0 0 2px', color: 'var(--text)' }}>
          {book.title}
        </h4>
        {book.formedCircleCount > 0 && (
          <span data-testid="admin-demand-book-circles" style={{ fontSize: '0.64rem', color: 'var(--success)' }}>
            кругов: {book.formedCircleCount}
          </span>
        )}
        <MetricsTooltip id={tooltipId} book={book} />
      </div>
      <div data-testid="admin-demand-book-aggregates" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0 0 4px' }}>
        {aggregates}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {book.participants.map((person) => (
          <li
            key={person.userId}
            data-testid="admin-demand-person"
            data-status={person.status}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.7rem 1fr auto',
              alignItems: 'baseline',
              columnGap: '0.5rem',
              padding: '1px 0',
              fontSize: '0.8rem',
              lineHeight: 1.4,
            }}
          >
            <span style={{
              fontFamily: 'var(--nd-mono)',
              fontSize: '0.72rem',
              color: person.rank !== null && person.rank <= TOP_RANK_LIMIT ? 'var(--text)' : 'var(--text-muted)',
            }}>
              {formatRank(person.rank)}
            </span>
            <span style={{ color: 'var(--text-body)' }}>{person.name}</span>
            <span style={{ fontSize: '0.68rem', justifySelf: 'end', whiteSpace: 'nowrap', color: STATUS_COLOR[person.status] }}>
              {STATUS_LABEL[person.status]}
            </span>
            {person.readingNow.length > 0 && (
              <span style={{ gridColumn: '2 / -1', fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                читает {person.readingNow.map((book) => `«${book.title}»`).join(', ')}
              </span>
            )}
          </li>
        ))}
      </ul>
    </article>
  )
}

interface BookDemandProps {
  books: CoordinationBook[] | null
  loading: boolean
  error: string | null
}

export default function AdminMatchingBookDemand({ books, loading, error }: BookDemandProps) {
  return (
    <section data-testid="admin-matching-demand">
      <p style={hintText}>
        Книги, которые держат в «Хочу читать» минимум трое активных участников сессии. Порядок — по силе
        общего интереса и рангам. Остальные метрики — по наведению или фокусу на названии книги.
      </p>
      {error && <p style={{ ...quietText, color: 'var(--accent)' }}>{error}</p>}
      {!error && books === null && loading && <p style={quietText}>Загрузка…</p>}
      {!error && books !== null && books.length === 0 && (
        <p data-testid="admin-demand-empty" style={quietText}>{EMPTY_DEMAND_TEXT}</p>
      )}
      {!error && books !== null && books.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {books.map((book) => <BookDemandCard key={book.bookId} book={book} />)}
        </div>
      )}
    </section>
  )
}
