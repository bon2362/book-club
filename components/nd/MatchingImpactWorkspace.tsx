'use client'

import { useState } from 'react'
import type { ScenarioSetOverview } from '@/lib/matching/scenarios'
import type { MyMoveBook } from '@/lib/matching/my-moves'
import MatchingScenarios from './MatchingScenarios'
import MatchingMyMoves from './MatchingMyMoves'
import type { BookParticipant } from './MatchingPersonalList'
import type { MatchingBookDetail } from './MatchingBookDetailModal'

interface BookInfo extends MatchingBookDetail {
  id: string
}

interface Props {
  overview: ScenarioSetOverview
  bookById: Map<string, BookInfo>
  bookParticipants: BookParticipant[]
  viewingUserId: string
  targetGroupSize: number
  moves: MyMoveBook[]
  frozen: boolean
  movesHeading: string
}

export default function MatchingImpactWorkspace({
  overview,
  bookById,
  bookParticipants,
  viewingUserId,
  targetGroupSize,
  moves,
  frozen,
  movesHeading,
}: Props) {
  const [hoveredMove, setHoveredMove] = useState<MyMoveBook | null>(null)

  return (
    <div className="grid gap-4 h-full min-h-0" style={{ gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 0.85fr)' }}>
      <section
        data-testid="matching-reader-circles-panel"
        className="flex flex-col overflow-hidden min-h-0 border"
        style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', borderRadius: 0 }}
      >
        <div className="px-4 py-3 shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2
            className="m-0"
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: '0.62rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: 'var(--text-muted)',
            }}
          >
            Читательские круги
          </h2>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          <MatchingScenarios
            overview={overview}
            bookById={bookById}
            bookParticipants={bookParticipants}
            viewingUserId={viewingUserId}
            targetGroupSize={targetGroupSize}
            highlightedScenarioId={hoveredMove?.impact?.scenarioId ?? null}
            highlightedBookId={hoveredMove?.bookId ?? null}
            highlightedUserIds={hoveredMove ? [
              viewingUserId,
              ...hoveredMove.existingParticipants.map((participant) => participant.userId),
            ] : []}
          />
        </div>
      </section>

      <section
        data-testid="matching-my-moves-panel"
        className="flex flex-col overflow-hidden min-h-0 border"
        style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', borderRadius: 0 }}
      >
        <div className="px-4 py-3 shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2
            className="m-0"
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: '0.62rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: 'var(--text-muted)',
            }}
          >
            {movesHeading}
          </h2>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          <MatchingMyMoves moves={moves} frozen={frozen} onMoveHover={setHoveredMove} />
        </div>
      </section>
    </div>
  )
}
