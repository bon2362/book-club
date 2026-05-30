'use client'

import { useState, useCallback } from 'react'
import type { ScenarioCandidate, ScenarioCard, ScenarioOverview } from '@/lib/matching/scenarios'
import CoverImage from './CoverImage'
import MatchingBookDetailModal, { type MatchingBookDetail } from './MatchingBookDetailModal'
import { getPseudonymColor } from './matching-shared'
import type { BookParticipant } from './MatchingPersonalList'

interface BookInfo extends MatchingBookDetail {
  id: string
}

interface Props {
  overview: ScenarioOverview
  bookById: Map<string, BookInfo>
  bookParticipants: BookParticipant[]
  viewingUserId: string
  targetGroupSize: number
}

const tierConfig = {
  leader: {
    style: { background: '#fff', borderTop: '2px solid #111', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', borderRadius: 0 },
    label: 'лидер',
    labelStyle: { color: '#C0603A' },
  },
  'max-coverage': {
    style: { background: '#fff', border: '1px solid #E5E5E5', borderRadius: 0 },
    label: 'макс. покрытие',
    labelStyle: { color: '#999' },
  },
  'sub-max': {
    style: { background: '#fff', border: '1px solid #E5E5E5', borderRadius: 0 },
    label: null,
    labelStyle: {},
  },
} as const

export default function MatchingScenarios({
  overview,
  bookById,
  bookParticipants,
  viewingUserId,
  targetGroupSize,
}: Props) {
  const [modalBook, setModalBook] = useState<BookInfo | null>(null)
  const openModal = useCallback((book: BookInfo) => setModalBook(book), [])
  const closeModal = useCallback(() => setModalBook(null), [])
  const alternatives = overview.candidates.filter((card) => !card.inCurrentLayout)

  if (overview.candidates.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-6 text-center"
        style={{ color: '#999' }}
      >
        <div className="text-3xl mb-2">🎯</div>
        <p className="text-sm">
          Пока недостаточно участников или записей для формирования кругов. Нужно минимум {targetGroupSize}
        </p>
      </div>
    )
  }

  return (
    <>
      {modalBook && (
        <MatchingBookDetailModal
          book={modalBook}
          chips={bookParticipants.filter((p) => p.bookId === modalBook.bookId)}
          viewingUserId={viewingUserId}
          onClose={closeModal}
        />
      )}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: '#999' }}>
          <span>Текущий расклад: {overview.coveredCount}/{overview.totalCount} участников</span>
          {overview.leftOut.length > 0 && (
            <>
              <span>·</span>
              <span>за бортом:</span>
              {overview.leftOut.map((p) => (
                <span
                  key={p.userId}
                  className={`inline-flex items-center px-2 py-0.5 text-[11px] ${getPseudonymColor(p.pseudonym).chip}`}
                  style={{ borderRadius: 0 }}
                >
                  {p.pseudonym}
                </span>
              ))}
            </>
          )}
        </div>

        {overview.current.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-[11px] font-semibold uppercase m-0" style={{ color: '#999' }}>
              Текущий расклад
            </h3>
            <ul className="list-none p-0 m-0 flex flex-col gap-3">
              {overview.current.map((card) => (
                <ScenarioItem
                  key={`current-${card.bookId}`}
                  card={card}
                  book={bookById.get(card.bookId)}
                  onOpen={openModal}
                />
              ))}
            </ul>
          </section>
        )}

        {alternatives.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-[11px] font-semibold uppercase m-0" style={{ color: '#999' }}>
              Возможные круги
            </h3>
            <ul className="list-none p-0 m-0 flex flex-col gap-3">
              {alternatives.map((card) => (
                <ScenarioItem
                  key={`candidate-${card.bookId}`}
                  card={card}
                  book={bookById.get(card.bookId)}
                  onOpen={openModal}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  )
}

function ScenarioItem({
  card,
  book,
  onOpen,
}: {
  card: ScenarioCard | ScenarioCandidate
  book: BookInfo | undefined
  onOpen: (book: BookInfo) => void
}) {
  const tier = tierConfig[card.tier]
  const candidate = 'inCurrentLayout' in card ? card : null
  const isAlternative = candidate !== null && !candidate.inCurrentLayout
  const label = isAlternative ? 'альтернатива' : tier.label
  const labelStyle = isAlternative
    ? { color: '#999' }
    : tier.labelStyle

  return (
    <li
      className="border p-3.5"
      style={isAlternative
        ? { background: '#fff', border: '1px solid #E5E5E5', borderRadius: 0 }
        : { ...tier.style }
      }
    >
      <div className="flex items-start gap-3">
        {book && (
          <div className="relative overflow-hidden shrink-0" style={{ width: 40, height: 56, borderRadius: 0 }}>
            <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <button
              onClick={() => book && onOpen(book)}
              className="text-left leading-snug hover:underline"
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontWeight: 700,
                fontSize: '0.92rem',
                letterSpacing: '-0.01em',
                color: '#111',
              }}
            >
              {book?.title ?? card.bookId}
            </button>
            {label && (
              <span
                className="text-[10px] shrink-0"
                style={{
                  ...labelStyle,
                  borderBottom: '1px solid currentColor',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  borderRadius: 0,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.12em',
                  padding: '0 0 1px',
                }}
              >
                {label}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {card.members.map((m) => (
              <span
                key={m.userId}
                className={`inline-flex items-center px-2 py-0.5 text-[11px] ${getPseudonymColor(m.pseudonym).chip}`}
                style={{ borderRadius: 0 }}
              >
                {m.pseudonym}
                <span className="ml-1 opacity-70">· {m.interest}</span>
              </span>
            ))}
          </div>
          {candidate && candidate.conflictsWith.length > 0 && (
            <p className="text-[11px] mt-2 mb-0" style={{ color: '#999' }}>
              Пересекается с текущим раскладом: {candidate.conflictsWith.join(', ')}
            </p>
          )}
        </div>
      </div>
    </li>
  )
}
