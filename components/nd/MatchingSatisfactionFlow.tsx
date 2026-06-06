'use client'

import { useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import MatchingPersonalList, { type BookParticipant } from './MatchingPersonalList'
import MatchingRealtimeWrapper from './MatchingRealtimeWrapper'
import type { CatalogBook } from '@/lib/matching/personal-list'
import { listHasCompleteActiveRanking } from '@/lib/matching/ranking-readiness'

export interface MatchingSatisfactionFlowProps {
  phase: 'gate' | 'board'
  books: CatalogBook[]
  bookParticipants: BookParticipant[]
  viewingUserId: string
  mutationUserId?: string
  frozen?: boolean
  sessionId: string
  header?: React.ReactNode
  workspace?: React.ReactNode
  catalogIntro?: React.ReactNode
}

export default function MatchingSatisfactionFlow(props: MatchingSatisfactionFlowProps) {
  const { phase, books, bookParticipants, viewingUserId, mutationUserId, frozen, sessionId } = props
  const router = useRouter()
  const board = phase === 'board'

  const initialCanEnter = useMemo(() => listHasCompleteActiveRanking(books), [books])
  const [canEnter, setCanEnter] = useState(initialCanEnter)

  const enter = useCallback(() => {
    if (!canEnter || board) return
    // ranks are already committed silently by MatchingPersonalList (suppressRefresh);
    // re-render the server tree so scenarios/board appear for the now-complete ranking.
    router.refresh()
  }, [canEnter, board, router])

  return (
    <div
      className="nd-flow"
      style={{ minHeight: '100svh', background: 'var(--bg)', color: 'var(--text)', position: 'relative' }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0,
          backgroundImage: 'linear-gradient(var(--hair-soft) 1px, transparent 1px)',
          backgroundSize: '100% 2.1rem', opacity: 0.5, pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative', maxWidth: 1080, margin: '0 auto', padding: '0 2rem',
          display: 'flex', flexDirection: 'column',
          ...(board ? { minHeight: '100svh' } : { height: '100svh' }),
        }}
      >
        {board && props.header}

        {!board && (
          <div data-testid="ranking-gate" style={{ maxWidth: 640, flex: '0 0 auto', padding: '2.2rem 0 0.4rem' }}>
            <h1 style={{ margin: 0, fontFamily: 'var(--nd-serif)', fontSize: '1.95rem', lineHeight: 1.14, fontWeight: 700, color: 'var(--text)' }}>
              Сначала расставьте приоритеты
            </h1>
            <p style={{ margin: '0.7rem 0 1.5rem', fontFamily: 'var(--nd-serif)', fontSize: '1.04rem', lineHeight: 1.55, color: 'var(--text-body)' }}>
              В этой сессии круги собираются по тому, что вы хотите читать{' '}
              <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>сильнее всего</em>.
              {' '}Добавьте книги в список справа и перетащите их по важности.
            </p>
          </div>
        )}

        {board && props.workspace}

        <div style={{ paddingBottom: board ? '2.4rem' : '1.2rem', ...(board ? { flex: '0 0 auto' } : { flex: '1 1 0%', minHeight: 0 }) }}>
          {board && props.catalogIntro}
          <MatchingPersonalList
            books={books}
            bookParticipants={bookParticipants}
            viewingUserId={viewingUserId}
            mutationUserId={mutationUserId}
            frozen={frozen}
            size={board ? 'compact' : 'large'}
            fill={!board}
            suppressRefresh={!board}
            onChange={!board ? setCanEnter : undefined}
          />
        </div>

        {!board && (
          <div
            style={{
              flex: '0 0 auto', borderTop: '1px solid var(--hair)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '1rem', flexWrap: 'wrap', padding: '1.2rem 0 2rem',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: '46ch' }}>
              Расставьте приоритеты и сможете войти в сессию.
            </p>
            <button
              type="button"
              data-testid="ranking-gate-enter"
              disabled={!canEnter}
              onClick={enter}
              style={{
                padding: '0.9rem 1.6rem', border: 'none', borderRadius: 'var(--radius)',
                background: canEnter ? 'var(--accent)' : 'var(--border)',
                color: canEnter ? 'var(--bg-input)' : 'var(--text-muted)',
                cursor: canEnter ? 'pointer' : 'default',
                fontFamily: 'var(--nd-sans)', fontSize: '0.72rem', letterSpacing: '0.08em',
                textTransform: 'uppercase', fontWeight: 700, whiteSpace: 'nowrap',
              }}
            >
              Войти в сессию →
            </button>
          </div>
        )}
      </div>

      <MatchingRealtimeWrapper sessionId={sessionId} />
    </div>
  )
}
