'use client'

import { useState, useCallback } from 'react'
import type { ScenarioCard } from '@/lib/matching/scenarios'
import CoverImage from './CoverImage'
import MatchingBookDetailModal, { type MatchingBookDetail } from './MatchingBookDetailModal'
import { getPseudonymColor } from './matching-shared'
import type { BookParticipant } from './MatchingPersonalList'

interface BookInfo extends MatchingBookDetail {
  id: string
}

interface Props {
  scenarios: ScenarioCard[]
  bookById: Map<string, BookInfo>
  bookParticipants: BookParticipant[]
  viewingUserId: string
  targetGroupSize: number
}

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
    style: { background: 'var(--bg-elevated)', borderColor: 'var(--border)' },
    label: null,
    labelStyle: {},
  },
} as const

export default function MatchingScenarios({
  scenarios,
  bookById,
  bookParticipants,
  viewingUserId,
  targetGroupSize,
}: Props) {
  const [modalBook, setModalBook] = useState<BookInfo | null>(null)
  const openModal = useCallback((book: BookInfo) => setModalBook(book), [])
  const closeModal = useCallback(() => setModalBook(null), [])

  if (scenarios.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-6 text-center"
        style={{ color: 'var(--text-muted)' }}
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
      <ul className="list-none p-0 m-0 flex flex-col gap-3">
        {scenarios.map((card) => {
          const book = bookById.get(card.bookId)
          const tier = tierConfig[card.tier]
          return (
            <li
              key={card.bookId}
              className="rounded-xl border p-3.5"
              style={tier.style}
            >
              <div className="flex items-start gap-3">
                {book && (
                  <div className="relative rounded overflow-hidden shrink-0" style={{ width: 40, height: 56 }}>
                    <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <button
                      onClick={() => book && openModal(book)}
                      className="text-sm font-semibold text-left leading-snug hover:underline"
                      style={{ color: 'var(--text)' }}
                    >
                      {book?.title ?? card.bookId}
                    </button>
                    {tier.label && (
                      <span className="text-[10px] border rounded-full px-2 py-0.5 shrink-0" style={tier.labelStyle}>
                        {tier.label}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {card.members.map((m) => (
                      <span
                        key={m.userId}
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${getPseudonymColor(m.pseudonym).chip}`}
                      >
                        {m.pseudonym}
                        <span className="ml-1 opacity-70">· {m.interest}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
