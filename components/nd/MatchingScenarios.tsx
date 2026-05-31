'use client'

import { useCallback, useState } from 'react'
import type { MatchingCircle, MatchingScenario, ScenarioSetOverview } from '@/lib/matching/scenarios'
import CoverImage from './CoverImage'
import MatchingBookDetailModal, { type MatchingBookDetail } from './MatchingBookDetailModal'
import { getPseudonymColor } from './matching-shared'
import type { BookParticipant } from './MatchingPersonalList'

interface BookInfo extends MatchingBookDetail {
  id: string
}

interface Props {
  overview: ScenarioSetOverview
  bookById: Map<string, BookInfo>
  bookParticipants: BookParticipant[]
  viewingUserId: string
  targetGroupSize: number
}

const tierLabel: Record<MatchingScenario['tier'], string> = {
  leader: 'текущий лучший',
  'full-coverage': 'полное покрытие',
  'best-achievable-partial': 'лучший частичный',
  partial: 'частичный',
  'blocked-better': 'может стать лучше',
}

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

  if (overview.scenarios.length === 0) {
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
        {overview.scenarios.map((scenario, index) => (
          <ScenarioSetCard
            key={scenario.id}
            scenario={scenario}
            scenarioNumber={index + 1}
            bookById={bookById}
            onOpen={openModal}
          />
        ))}
      </ul>
    </>
  )
}

function ScenarioSetCard({
  scenario,
  scenarioNumber,
  bookById,
  onOpen,
}: {
  scenario: MatchingScenario
  scenarioNumber: number
  bookById: Map<string, BookInfo>
  onOpen: (book: BookInfo) => void
}) {
  const isLeader = scenario.tier === 'leader'

  return (
    <li
      className="border"
      style={{
        background: 'var(--bg-input)',
        borderColor: isLeader ? 'var(--border-strong)' : 'var(--border)',
        borderTopWidth: isLeader ? 2 : 1,
        borderRadius: 0,
      }}
    >
      <div
        className="px-3 py-2 border-b flex flex-wrap items-center gap-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <h3
          className="m-0"
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.12em',
            color: 'var(--text)',
          }}
        >
          Сценарий {scenarioNumber}
        </h3>
        <span
          className="text-[10px]"
          style={{
            color: isLeader ? 'var(--accent)' : 'var(--text-muted)',
            borderBottom: '1px solid currentColor',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.1em',
            paddingBottom: 1,
          }}
        >
          {tierLabel[scenario.tier]}
        </span>
        <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
          {scenario.score.coveredCount}/{scenario.score.totalCount} участни:ц
        </span>
      </div>

      <div className="p-3 flex flex-col gap-2.5">
        {scenario.circles.map((circle) => (
          <CircleItem
            key={circle.id}
            circle={circle}
            book={bookById.get(circle.bookId)}
            onOpen={onOpen}
          />
        ))}

        {scenario.leftOut.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              За бортом:
            </span>
            {scenario.leftOut.map((participant) => (
              <span
                key={participant.userId}
                className={`inline-flex items-center px-2 py-0.5 text-[11px] ${getPseudonymColor(participant.pseudonym).chip}`}
                style={{ borderRadius: 0 }}
              >
                {participant.pseudonym}
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

function CircleItem({
  circle,
  book,
  onOpen,
}: {
  circle: MatchingCircle
  book: BookInfo | undefined
  onOpen: (book: BookInfo) => void
}) {
  return (
    <div
      className="border p-3"
      style={{
        background: 'var(--bg)',
        borderColor: 'var(--border)',
        borderRadius: 0,
      }}
    >
      <div className="flex items-start gap-3">
        {book && (
          <div className="relative overflow-hidden shrink-0" style={{ width: 40, height: 56, borderRadius: 0 }}>
            <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => book && onOpen(book)}
            className="text-left leading-snug hover:underline"
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontWeight: 700,
              fontSize: '0.92rem',
              color: 'var(--text)',
            }}
          >
            {book?.title ?? circle.bookId}
          </button>
          <div className="flex flex-wrap gap-1 mt-2">
            {circle.members.map((member) => (
              <span
                key={member.userId}
                className={`inline-flex items-center px-2 py-0.5 text-[11px] ${getPseudonymColor(member.pseudonym).chip}`}
                style={{ borderRadius: 0 }}
              >
                {member.pseudonym}
                <span className="ml-1 opacity-70">· {member.interest}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
