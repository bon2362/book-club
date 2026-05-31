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
  mutationUserId?: string
}

const panel: React.CSSProperties = {
  background: 'var(--bg-input)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  minHeight: 0,
}

const panelHeadStyle: React.CSSProperties = {
  padding: '1.05rem 1.25rem 0.75rem',
  flexShrink: 0,
}

const h2Style: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--nd-serif)',
  fontSize: '1.08rem',
  fontWeight: 700,
  color: 'var(--text)',
  letterSpacing: '-0.01em',
}

const subStyle: React.CSSProperties = {
  margin: '0.25rem 0 0',
  fontSize: '0.78rem',
  color: 'var(--text-muted)',
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
  mutationUserId,
}: Props) {
  const scenarioCount = overview.scenarios.length

  return (
    <div className="grid gap-4 h-full min-h-0" style={{ gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 0.85fr)' }}>
      <section data-testid="matching-reader-circles-panel" style={panel}>
        <div style={panelHeadStyle}>
          <h2 style={h2Style}>
            Читательские круги
            {scenarioCount > 0 && (
              <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                {' '}· {scenarioCount} {scenarioCount === 1 ? 'вариант' : scenarioCount < 5 ? 'варианта' : 'вариантов'}
              </span>
            )}
          </h2>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '0 0 1.2rem' }}>
          <MatchingScenarios
            overview={overview}
            bookById={bookById}
            bookParticipants={bookParticipants}
            viewingUserId={viewingUserId}
            targetGroupSize={targetGroupSize}
          />
        </div>
      </section>

      <section data-testid="matching-my-moves-panel" style={panel}>
        <div style={panelHeadStyle}>
          <h2 style={h2Style}>{movesHeading}</h2>
          <p style={subStyle}>Добавьте книгу — и соберётся новый круг</p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '0 0 1.2rem' }}>
          <MatchingMyMoves
            moves={moves}
            frozen={frozen}
            bookById={bookById}
            bookParticipants={bookParticipants}
            viewingUserId={viewingUserId}
            mutationUserId={mutationUserId}
          />
        </div>
      </section>
    </div>
  )
}
