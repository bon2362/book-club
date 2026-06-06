'use client'

import { useCallback, useState } from 'react'
import type { MatchingCircle, MatchingScenario, OptimizationMode, ScenarioSetOverview } from '@/lib/matching/scenarios'
import type { MyMoveBook } from '@/lib/matching/my-moves'
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
  highlightedScenarioId?: string | null
  highlightedBookId?: string | null
  highlightedUserIds?: string[]
  previewMove?: MyMoveBook | null
  previewOpen?: boolean
  mode?: OptimizationMode
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
  highlightedScenarioId = null,
  highlightedBookId = null,
  highlightedUserIds = [],
  previewMove = null,
  previewOpen = false,
  mode = overview.mode,
}: Props) {
  const [modalBook, setModalBook] = useState<BookInfo | null>(null)
  const openModal = useCallback((book: BookInfo) => setModalBook(book), [])
  const closeModal = useCallback(() => setModalBook(null), [])
  const previewScenario = previewMove?.impact?.previewScenario ?? null

  if (overview.scenarios.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-6 text-center"
        style={{ color: 'var(--text-muted)' }}
      >
        <div className="text-3xl mb-2">🎯</div>
        <p className="text-sm">
          Пока недостаточно участников или записей для формирования кругов. Нужно минимум {overview.minGroupSize}
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
        <li className={`nd-scenario-preview-slot ${previewOpen ? 'is-open' : ''}`} aria-hidden={!previewOpen}>
          <div className="nd-scenario-preview-clip">
            {previewScenario && (
              <>
                <div className="nd-scenario-preview-banner">
                  <span>{mode === 'satisfaction' ? '↑ Добавится новый расклад' : '↑ Нашёлся расклад лучше'}</span>
                </div>
                <ScenarioSetCard
                  scenario={{ ...previewScenario, tier: 'leader' }}
                  scenarioNumber={1}
                  bookById={bookById}
                  onOpen={openModal}
                  viewingUserId={viewingUserId}
                  highlightedUserIds={highlightedUserIds}
                  highlighted
                  variant="preview"
                  previewMoveTitle={previewMove?.title ?? null}
                  mode={mode}
                />
              </>
            )}
          </div>
        </li>
        {overview.scenarios.map((scenario, index) => (
          <ScenarioSetCard
            key={scenario.id}
            scenario={scenario}
            scenarioNumber={index + 1}
            bookById={bookById}
            onOpen={openModal}
            viewingUserId={viewingUserId}
            highlightedUserIds={highlightedUserIds}
            highlighted={
              scenario.id === highlightedScenarioId ||
              scenario.circles.some((circle) => circle.bookId === highlightedBookId)
            }
            muted={previewOpen}
            mode={mode}
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
  viewingUserId,
  highlightedUserIds,
  highlighted,
  muted,
  variant = 'current',
  previewMoveTitle = null,
  mode = 'coverage',
}: {
  scenario: MatchingScenario
  scenarioNumber: number
  bookById: Map<string, BookInfo>
  onOpen: (book: BookInfo) => void
  viewingUserId: string
  highlightedUserIds: string[]
  highlighted: boolean
  muted?: boolean
  variant?: 'current' | 'preview'
  previewMoveTitle?: string | null
  mode?: OptimizationMode
}) {
  const isLeader = scenario.tier === 'leader'
  const isPreview = variant === 'preview'
  const isSatisfaction = mode === 'satisfaction' && !isPreview
  const usesSatisfactionCopy = mode === 'satisfaction'
  const isLinking = (isLeader || isPreview) && highlightedUserIds.length > 0
  const highlightedUserIdSet = new Set(highlightedUserIds)
  const hasViewerLeftOut = scenario.leftOut.some((participant) => participant.userId === viewingUserId)
  const shouldWarnViewerLeftOut = isLeader && hasViewerLeftOut
  const CardElement = isPreview ? 'div' : 'li'
  const scoreTitle = [
    `Покрытие: ${scenario.score.coveredCount}/${scenario.score.totalCount}`,
    `Очень хотят: ${scenario.score.strongInterestCount}`,
    `Средний ранг: ${scenario.score.avgRank === null ? 'нет' : scenario.score.avgRank.toFixed(1)}`,
    `Худший ранг: ${scenario.score.worstRank ?? 'нет'}`,
    `Без ранга: ${scenario.score.unrankedCount}`,
    mode === 'satisfaction'
      ? 'Сортировка: ниже средний ранг → ниже худший ранг → больше размер круга → стабильный id.'
      : 'Сортировка: больше покрытие → больше «очень хочу» → ниже средний ранг → ниже худший ранг → меньше записей без ранга.',
  ].join('\n')

  return (
    <CardElement
      className={[
        isPreview ? 'nd-scenario-preview-card' : 'nd-scenario-current',
        !isPreview && muted ? 'nd-scenario-muted' : '',
      ].filter(Boolean).join(' ')}
      style={{
        background: isPreview
          ? 'var(--bg-input)'
          : isSatisfaction ? 'var(--bg-input)' : isLeader ? 'var(--accent-soft)' : highlighted ? 'var(--accent-soft)' : 'var(--bg-input)',
        borderRadius: 'var(--radius-card)',
        boxShadow: isPreview || isLeader ? 'none' : 'var(--shadow-card)',
        borderLeft: shouldWarnViewerLeftOut && !isSatisfaction ? '3px solid var(--status-warn)' : undefined,
        padding: '0.85rem 1rem',
      }}
      data-highlighted={highlighted ? 'true' : 'false'}
      data-viewer-left-out={shouldWarnViewerLeftOut ? 'true' : 'false'}
      data-testid={isPreview ? 'matching-scenario-preview-card' : 'matching-scenario-card'}
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
            color: isLeader && !isSatisfaction ? 'var(--accent)' : 'var(--text-muted)',
          }}
        >
          {isPreview ? 'Если добавишь' : `Сценарий ${scenarioNumber}`}
        </h3>
        {isPreview && previewMoveTitle && (
          <span
            style={{
              minWidth: 0,
              color: 'var(--text-secondary)',
              fontSize: '0.68rem',
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={previewMoveTitle}
          >
            «{previewMoveTitle}»
          </span>
        )}
        {isPreview ? (
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
            {usesSatisfactionCopy ? '+1 сценарий' : 'станет лучшим'}
          </span>
        ) : isLeader && !isSatisfaction && (
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
            лучший сейчас
          </span>
        )}
        {!isSatisfaction && !isLeader && tierLabel[scenario.tier] && (
          <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>
            {tierLabel[scenario.tier]}
          </span>
        )}
        <span className="ml-auto" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {isSatisfaction
            ? `охват: ${scenario.score.coveredCount} из ${scenario.score.totalCount}`
            : scenario.score.coveredCount === scenario.score.totalCount
              ? `Покрытие: все ${scenario.score.totalCount}`
              : `Покрытие: ${scenario.score.coveredCount} из ${scenario.score.totalCount}`}
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
            isSatisfaction={isSatisfaction}
            isLinking={isLinking}
            highlightedUserIds={highlightedUserIdSet}
          />
        ))}
      </div>

      {scenario.leftOut.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-1"
          style={{ marginTop: '0.7rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}
        >
          <span>{usesSatisfactionCopy ? 'За бортом остаются:' : 'За бортом:'}</span>
          {scenario.leftOut.map((participant, idx) => (
            <LeftOutName
              key={participant.userId}
              participant={participant}
              isMe={participant.userId === viewingUserId}
              isLinked={isLinking && highlightedUserIdSet.has(participant.userId)}
              isDimmed={isLinking && !highlightedUserIdSet.has(participant.userId)}
              prefix={idx > 0}
              soft={isSatisfaction}
            />
          ))}
        </div>
      )}
    </CardElement>
  )
}

function LeftOutName({
  participant,
  isMe,
  isLinked,
  isDimmed,
  prefix,
  soft,
}: {
  participant: { userId: string; pseudonym: string }
  isMe: boolean
  isLinked: boolean
  isDimmed: boolean
  prefix: boolean
  soft: boolean
}) {
  return (
    <span
      style={{
        color: soft ? 'var(--text-secondary)' : isMe ? 'var(--status-warn)' : isLinked ? 'var(--accent)' : 'var(--text-secondary)',
        fontWeight: isMe || isLinked ? 700 : 400,
        background: isLinked ? 'var(--accent-soft)' : 'transparent',
        borderRadius: 'var(--radius)',
        padding: isLinked ? '0.06rem 0.4rem' : 0,
        opacity: isDimmed && !isMe ? 0.4 : 1,
        transition: 'opacity 0.16s ease, background 0.16s ease',
      }}
    >
      {prefix && <span style={{ color: 'var(--hair)', margin: '0 0.2rem' }}>·</span>}
      {participant.pseudonym}{isMe ? ' · вы' : ''}
    </span>
  )
}

function CircleItem({
  circle,
  book,
  onOpen,
  isFirst,
  isLeader,
  isSatisfaction,
  isLinking,
  highlightedUserIds,
}: {
  circle: MatchingCircle
  book: BookInfo | undefined
  onOpen: (book: BookInfo) => void
  isFirst: boolean
  isLeader: boolean
  isSatisfaction: boolean
  isLinking: boolean
  highlightedUserIds: Set<string>
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.8rem',
        alignItems: 'flex-start',
        padding: '0.55rem 0',
        borderTop: isFirst ? 'none' : `1px solid ${isLeader && !isSatisfaction ? 'var(--accent-soft)' : 'var(--hair-soft)'}`,
      }}
    >
      {book && (
        <div
          className="relative overflow-hidden shrink-0"
          style={{ width: 42, height: 60, borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-card)' }}
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
        <div className="flex flex-wrap mt-1.5" style={{ gap: '0.3rem 0.55rem' }}>
          {circle.members.map((member) => (
            <ParticipantInterestChip
              key={member.userId}
              userId={member.userId}
              pseudonym={member.pseudonym}
              rank={member.rank}
              highlighted={isLinking && highlightedUserIds.has(member.userId)}
              dimmed={isLinking && !highlightedUserIds.has(member.userId)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
