'use client'

import { useCallback, useState } from 'react'
import type { MatchingCircle, MatchingScenario, ScenarioSetOverview } from '@/lib/matching/scenarios'
import CoverImage from './CoverImage'
import MatchingBookDetailModal, { type MatchingBookDetail } from './MatchingBookDetailModal'
import type { BookParticipant } from './MatchingPersonalList'
import ParticipantInterestChip from './ParticipantInterestChip'

interface BookInfo extends MatchingBookDetail {
  id: string
}

interface Props {
  overview: ScenarioSetOverview
  bookById: Map<string, BookInfo>
  bookParticipants: BookParticipant[]
  viewingUserId: string
  targetGroupSize: number
  highlightedScenarioId?: string | null
  highlightedBookId?: string | null
  highlightedUserIds?: string[]
}

const tierLabel: Record<MatchingScenario['tier'], string | null> = {
  leader: 'лучший',
  'full-coverage': 'полное покрытие',
  'best-achievable-partial': null,
  partial: null,
  'blocked-better': 'может стать лучше',
}

export default function MatchingScenarios({
  overview,
  bookById,
  bookParticipants,
  viewingUserId,
  targetGroupSize,
  highlightedScenarioId = null,
  highlightedBookId = null,
  highlightedUserIds = [],
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
      {/* Тёплый фон контейнера — белые карточки сценариев читаются на нём */}
      <ul
        className="list-none p-0 m-0 flex flex-col"
        style={{ background: 'var(--bg)', padding: '0.7rem', gap: '0.7rem', display: 'flex', flexDirection: 'column' }}
      >
        {overview.scenarios.map((scenario, index) => (
          <ScenarioSetCard
            key={scenario.id}
            scenario={scenario}
            scenarioNumber={index + 1}
            bookById={bookById}
            onOpen={openModal}
            highlighted={
              scenario.id === highlightedScenarioId ||
              scenario.circles.some((circle) => (
                circle.bookId === highlightedBookId ||
                circle.members.some((member) => highlightedUserIds.includes(member.userId))
              ))
            }
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
  highlighted,
}: {
  scenario: MatchingScenario
  scenarioNumber: number
  bookById: Map<string, BookInfo>
  onOpen: (book: BookInfo) => void
  highlighted: boolean
}) {
  const isLeader = scenario.tier === 'leader'
  const scoreTitle = [
    `Покрытие: ${scenario.score.coveredCount}/${scenario.score.totalCount}`,
    `Очень хотят: ${scenario.score.strongInterestCount}`,
    `Средний ранг: ${scenario.score.avgRank === null ? 'нет' : scenario.score.avgRank.toFixed(1)}`,
    `Худший ранг: ${scenario.score.worstRank ?? 'нет'}`,
    `Без ранга: ${scenario.score.unrankedCount}`,
    'Сортировка: больше покрытие → больше «очень хочу» → ниже средний ранг → ниже худший ранг → меньше записей без ранга.',
  ].join('\n')

  return (
    <li
      style={{
        background: isLeader ? 'var(--accent-soft)' : highlighted ? 'rgba(192, 96, 58, 0.04)' : 'var(--bg-input)',
        borderRadius: 'var(--radius-card)',
        boxShadow: isLeader ? 'none' : '0 1px 2px rgba(50,38,24,.04)',
        padding: '0.85rem 1rem',
      }}
      data-highlighted={highlighted ? 'true' : 'false'}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h3
          className="m-0"
          title={scoreTitle}
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.1em',
            color: isLeader ? 'var(--accent)' : 'var(--text-muted)',
          }}
        >
          Сценарий {scenarioNumber}
        </h3>
        {isLeader && (
          <span
            style={{
              fontSize: '0.66rem',
              fontWeight: 700,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.06em',
              background: 'var(--accent)',
              color: 'var(--bg-input)',
              padding: '0.12rem 0.5rem',
              borderRadius: 'var(--radius-pill)',
            }}
          >
            лучший
          </span>
        )}
        {!isLeader && tierLabel[scenario.tier] && (
          <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>
            {tierLabel[scenario.tier]}
          </span>
        )}
        <span className="ml-auto" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {scenario.score.coveredCount === scenario.score.totalCount
            ? `все ${scenario.score.totalCount} участников`
            : `${scenario.score.coveredCount} из ${scenario.score.totalCount} участников`}
        </span>
      </div>

      {/* Circles: rows separated by hairline */}
      <div>
        {scenario.circles.map((circle, idx) => (
          <CircleItem
            key={circle.id}
            circle={circle}
            book={bookById.get(circle.bookId)}
            onOpen={onOpen}
            isFirst={idx === 0}
            isLeader={isLeader}
          />
        ))}
      </div>

      {scenario.leftOut.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-1"
          style={{ marginTop: '0.7rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}
        >
          <span>За бортом:</span>
          {scenario.leftOut.map((participant, idx) => (
            <span key={participant.userId} style={{ color: 'var(--text-secondary)' }}>
              {idx > 0 && <span style={{ color: 'var(--hair)', margin: '0 0.2rem' }}>·</span>}
              {participant.pseudonym}
            </span>
          ))}
        </div>
      )}
    </li>
  )
}

function CircleItem({
  circle,
  book,
  onOpen,
  isFirst,
  isLeader,
}: {
  circle: MatchingCircle
  book: BookInfo | undefined
  onOpen: (book: BookInfo) => void
  isFirst: boolean
  isLeader: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.8rem',
        alignItems: 'flex-start',
        padding: '0.55rem 0',
        borderTop: isFirst ? 'none' : `1px solid ${isLeader ? 'rgba(181, 83, 43, 0.14)' : 'var(--hair-soft)'}`,
      }}
    >
      {book && (
        <div
          className="relative overflow-hidden shrink-0"
          style={{ width: 42, height: 60, borderRadius: 4, boxShadow: '0 1px 3px rgba(40,30,20,0.14)' }}
        >
          <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={() => book && onOpen(book)}
          className="text-left leading-snug"
          style={{
            fontFamily: 'var(--nd-serif)',
            fontWeight: 700,
            fontSize: '1rem',
            letterSpacing: '-0.01em',
            color: 'var(--text)',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.color = 'var(--accent)' }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'var(--text)' }}
        >
          {book?.title ?? circle.bookId}
        </button>
        <div className="flex flex-wrap mt-1.5" style={{ gap: '0.3rem 0' }}>
          {circle.members.map((member) => (
            <ParticipantInterestChip
              key={member.userId}
              userId={member.userId}
              pseudonym={member.pseudonym}
              rank={member.rank}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
