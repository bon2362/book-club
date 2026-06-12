'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ScenarioSetOverview } from '@/lib/matching/scenarios'
import type { MyMoveBook } from '@/lib/matching/my-moves'
import MatchingScenarios from './MatchingScenarios'
import MatchingMyMoves from './MatchingMyMoves'
import MatchingAdriftBanner from './MatchingAdriftBanner'
import { useMatchingBoard } from './MatchingBoardProvider'
import type { BookParticipant } from './MatchingPersonalList'
import type { MatchingBookDetail } from './MatchingBookDetailModal'
import type { AdriftCause } from '@/lib/matching/feed-events'

interface BookInfo extends MatchingBookDetail {
  id: string
}

interface Props {
  sessionId: string
  overview: ScenarioSetOverview
  bookById: Map<string, BookInfo>
  bookParticipants: BookParticipant[]
  viewingUserId: string
  moves: MyMoveBook[]
  frozen: boolean
  movesHeading: string
  mutationUserId?: string
  adrift?: {
    reason: 'change' | 'never'
    cause: (AdriftCause & { bookTitle?: string | null }) | null
  } | null
  adminNamesByPseudonym?: Map<string, string | null> | null
}

const panel: React.CSSProperties = {
  background: 'var(--bg-input)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  minHeight: 0,
  position: 'relative',
}

/** Оверлей-спиннер во время пересчёта сценариев (#315). */
function BoardPanelLoader() {
  return (
    <div
      data-testid="matching-board-loader"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'color-mix(in srgb, var(--bg-input) 55%, transparent)',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <span className="nd-board-spinner" />
    </div>
  )
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
  sessionId,
  overview,
  bookById,
  bookParticipants,
  viewingUserId,
  moves,
  frozen,
  movesHeading,
  mutationUserId,
  adrift = null,
  adminNamesByPseudonym = null,
}: Props) {
  const mode = overview.mode
  const { pending } = useMatchingBoard()
  const scenarioCount = overview.scenarios.length
  const [previewMove, setPreviewMove] = useState<MyMoveBook | null>(null)
  const [lastMove, setLastMove] = useState<MyMoveBook | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const visiblePreviewMove = previewMove ?? lastMove
  const previewBeneficiaryIds = useMemo(
    () => visiblePreviewMove?.impact?.beneficiaries.map((beneficiary) => beneficiary.userId) ?? [],
    [visiblePreviewMove],
  )

  const handlePreview = useCallback((move: MyMoveBook | null) => {
    setPreviewMove(move)
    if (move) {
      setLastMove(move)
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [])

  const handleFixAdrift = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    setPreviewMove(null)
    setLastMove(null)
  }, [moves])

  // Закрытие баннера «Вы пока не в круге» (#339): запоминаем в localStorage и
  // держим закрытым, пока не изменится расклад (сигнатура = id лидер-сценария).
  // Как только пользователь снова в круге (adrift == null) — забываем закрытие,
  // чтобы при новом выпадении баннер вернулся.
  const isAdrift = !!adrift
  const adriftSignature = overview.leader?.id ?? 'none'
  const dismissKey = `matching:adrift-dismissed:${sessionId}`
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(null)
  const [adriftHydrated, setAdriftHydrated] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setDismissedSignature(window.localStorage.getItem(dismissKey))
    setAdriftHydrated(true)
  }, [dismissKey])

  useEffect(() => {
    if (typeof window === 'undefined' || isAdrift) return
    window.localStorage.removeItem(dismissKey)
    setDismissedSignature(null)
  }, [isAdrift, dismissKey])

  const handleDismissAdrift = useCallback(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(dismissKey, adriftSignature)
    setDismissedSignature(adriftSignature)
  }, [dismissKey, adriftSignature])

  const showAdrift = isAdrift && adriftHydrated && dismissedSignature !== adriftSignature

  return (
    <div className="flex flex-col h-full min-h-0">
      {showAdrift && adrift && (
        <MatchingAdriftBanner
          reason={adrift.reason}
          cause={adrift.cause}
          onFix={handleFixAdrift}
          onDismiss={handleDismissAdrift}
          viewingUserId={viewingUserId}
          mode={mode}
        />
      )}
      <div className="grid flex-1 min-h-0" style={{ gridTemplateColumns: 'minmax(0, 1.18fr) minmax(0, 0.82fr)', gap: '1.1rem' }}>
      <section data-testid="matching-reader-circles-panel" style={panel}>
        <div style={panelHeadStyle}>
          <h2 style={h2Style}>
            {mode === 'satisfaction' ? 'Сценарии кругов' : 'Читательские круги'}
            {scenarioCount > 0 && (
              <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                {' '}· {scenarioCount} {scenarioCount === 1 ? 'сценарий' : scenarioCount < 5 ? 'сценария' : 'сценариев'}
              </span>
            )}
          </h2>
          {mode === 'satisfaction' && (
            <p style={subStyle}>
              Добавляйте, убирайте книги и меняйте приоритеты, чтобы влиять на финальный расклад
            </p>
          )}
        </div>
        {pending && <BoardPanelLoader />}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto"
          style={{ padding: '0 0 1.2rem', overflowAnchor: 'none', opacity: pending ? 0.45 : 1, transition: 'opacity 0.25s ease' }}
        >
          <MatchingScenarios
            overview={overview}
            bookById={bookById}
            bookParticipants={bookParticipants}
            viewingUserId={viewingUserId}
            previewOpen={previewMove !== null}
            previewMove={visiblePreviewMove}
            highlightedUserIds={previewMove ? previewBeneficiaryIds : []}
            mode={mode}
            adminNamesByPseudonym={adminNamesByPseudonym}
          />
        </div>
      </section>

      <section data-testid="matching-my-moves-panel" style={panel}>
        <div style={panelHeadStyle}>
          <h2 style={h2Style}>{movesHeading}</h2>
          <p style={subStyle}>
            {mode === 'satisfaction'
              ? 'Эти книги могут собрать круг с более близким совпадением интересов.'
              : 'Эти книги меняют лучший расклад. Добавишь — поможешь другим собраться вокруг того, что им ближе.'}
          </p>
        </div>
        {pending && <BoardPanelLoader />}
        <div
          className="flex-1 min-h-0 overflow-y-auto"
          style={{ padding: '0 0 1.2rem', opacity: pending ? 0.45 : 1, transition: 'opacity 0.25s ease' }}
        >
          <MatchingMyMoves
            moves={moves}
            frozen={frozen}
            mutationUserId={mutationUserId}
            onMovePreview={handlePreview}
            mode={mode}
            adminNamesByPseudonym={adminNamesByPseudonym}
          />
        </div>
      </section>
      </div>
    </div>
  )
}
