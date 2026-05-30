'use client'

import { useState, useCallback } from 'react'
import type { ScenarioCard } from '@/lib/matching/scenarios'
import CoverImage from './CoverImage'

interface BookInfo {
  id: string
  title: string
  author: string
  coverUrl: string | null
}

interface Props {
  scenarios: ScenarioCard[]
  bookById: Map<string, BookInfo>
}

const tierConfig = {
  leader: {
    bg: 'bg-[#f0fdf4]',
    border: 'border-[#86efac]',
    label: 'лидер',
    labelClass: 'text-[#15803d] border-[#86efac]',
  },
  'max-coverage': {
    bg: 'bg-[#eff6ff]',
    border: 'border-[#93c5fd]',
    label: 'макс. покрытие',
    labelClass: 'text-[#1d4ed8] border-[#93c5fd]',
  },
  'sub-max': {
    bg: 'bg-[var(--bg-elevated)]',
    border: 'border-[var(--border-subtle)]',
    label: null,
    labelClass: '',
  },
} as const

const PSEUDONYM_COLORS = [
  'bg-[#fde8d8] text-[#7c3516]',
  'bg-[#dcfce7] text-[#14532d]',
  'bg-[#dbeafe] text-[#1e3a8a]',
  'bg-[#fef9c3] text-[#713f12]',
  'bg-[#f3e8ff] text-[#581c87]',
  'bg-[#ffe4e6] text-[#881337]',
  'bg-[#d1fae5] text-[#065f46]',
  'bg-[#e0f2fe] text-[#075985]',
]

function pseudonymColor(pseudonym: string) {
  let hash = 0
  for (let i = 0; i < pseudonym.length; i++) hash = pseudonym.charCodeAt(i) + ((hash << 5) - hash)
  return PSEUDONYM_COLORS[Math.abs(hash) % PSEUDONYM_COLORS.length]
}

interface BookModalProps {
  book: BookInfo
  onClose: () => void
}

function BookModal({ book, onClose }: BookModalProps) {
  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={book.title}
        onClick={(e) => e.stopPropagation()}
        className="border rounded-xl p-5 max-w-[380px] w-full"
        style={{
          background: 'var(--bg-input)',
          borderColor: 'var(--border)',
          boxShadow: '0 24px 70px var(--shadow)',
        }}
      >
        <div className="flex gap-4 mb-4">
          <div className="relative rounded overflow-hidden shrink-0" style={{ width: 56, height: 80 }}>
            <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm leading-snug mb-1">{book.title}</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{book.author}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-xs cursor-pointer"
          style={{ color: 'var(--text-muted)' }}
        >
          Закрыть (Esc)
        </button>
      </div>
    </div>
  )
}

export default function MatchingScenarios({ scenarios, bookById }: Props) {
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
        <p className="text-sm">Недостаточно участников или сигнапов для формирования сценариев.</p>
      </div>
    )
  }

  return (
    <>
      {modalBook && <BookModal book={modalBook} onClose={closeModal} />}
      <ul className="list-none p-0 m-0 flex flex-col gap-3">
        {scenarios.map((card) => {
          const book = bookById.get(card.bookId)
          const tier = tierConfig[card.tier]
          return (
            <li
              key={card.bookId}
              className={`rounded-xl border p-3.5 ${tier.bg} ${tier.border}`}
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
                      <span className={`text-[10px] border rounded-full px-2 py-0.5 shrink-0 ${tier.labelClass}`}>
                        {tier.label}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {card.members.map((m) => (
                      <span
                        key={m.userId}
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${pseudonymColor(m.pseudonym)}`}
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
