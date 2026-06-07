'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import MatchingPersonalList, { type BookParticipant } from './MatchingPersonalList'
import MatchingRealtimeWrapper from './MatchingRealtimeWrapper'
import type { CatalogBook } from '@/lib/matching/personal-list'
import { listHasCompleteActiveRanking } from '@/lib/matching/ranking-readiness'

/** Coupled height collapse/grow via the grid-rows 0fr↔1fr trick. The section
 *  grows from zero height together with its content (pushing the catalog down),
 *  rather than expanding a fixed 100svh viewport — gentle, coupled motion.
 *  Timing + reduced-motion live in globals.css (.nd-flow-collapsible). */
function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className={'nd-flow-collapsible' + (open ? ' is-open' : '')}>
      <div className="nd-flow-collapsible-inner">{children}</div>
    </div>
  )
}

export interface MatchingSatisfactionFlowProps {
  phase: 'gate' | 'board'
  sessionId: string
  books: CatalogBook[]
  bookParticipants: BookParticipant[]
  viewingUserId: string
  mutationUserId?: string
  frozen?: boolean
  /** Board chrome — provided by the server only in board phase. */
  header?: React.ReactNode
  workspace?: React.ReactNode
  catalogIntro?: React.ReactNode
}

/**
 * Satisfaction-mode gate ↔ board as a single full-width page that morphs.
 *
 * The personal list (catalog + «Мои книги») is rendered once and stays mounted
 * across the transition. On «Войти в сессию» the ranks are already committed
 * silently, so we just `router.refresh()`. page.tsx renders this component at
 * the same tree position in both phases, so the instance is preserved: when the
 * server returns `phase="board"` the `board` prop flips false→true and the
 * grid-rows collapsibles transition **with the board content already present** —
 * the «Сценарии»/«Мои ходы» section grows from zero height coupled with the
 * catalog sliding down. (Triggering the grow on click instead would animate an
 * empty section, then pop the content in — which is the bug this avoids.)
 */
export default function MatchingSatisfactionFlow({
  phase,
  sessionId,
  books,
  bookParticipants,
  viewingUserId,
  mutationUserId,
  frozen,
  header,
  workspace,
  catalogIntro,
}: MatchingSatisfactionFlowProps) {
  const router = useRouter()
  const board = phase === 'board'

  const initialCanEnter = useMemo(() => listHasCompleteActiveRanking(books), [books])
  const [canEnter, setCanEnter] = useState(initialCanEnter)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (board) window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [board])

  const enter = useCallback(() => {
    if (!canEnter || board || submitting) return
    // Ranks are committed silently by the list; refresh so the server returns the
    // board phase. The morph plays when `board` flips true (content present).
    setSubmitting(true)
    router.refresh()
  }, [canEnter, board, submitting, router])

  return (
    <div
      className={'nd-flow flex flex-col' + (board ? ' is-board' : '')}
      style={{
        background: 'var(--bg)',
        color: 'var(--text)',
        ...(board ? { minHeight: '100svh' } : { height: '100svh', overflow: 'hidden' }),
      }}
    >
      {/* Board chrome: header + scenarios/moves. Capped just under one screen
          (90svh) with the workspace scrolling internally, so the grid-rows grow
          stops with the catalog peeking at the bottom — a hint that it scrolls —
          instead of ballooning to the full height of many scenarios. */}
      <Collapsible open={board}>
        <div className="nd-flow-slide-from-top flex flex-col" style={{ height: '90svh' }}>
          {header}
          <div className="flex-1 min-h-0 p-4">{workspace}</div>
        </div>
      </Collapsible>

      {/* Gate intro (collapses on enter) */}
      <Collapsible open={!board}>
        <div className="nd-flow-fade-collapse" data-testid="ranking-gate" style={{ padding: '1.6rem 1rem 0.4rem' }}>
          <section style={{ maxWidth: 640 }}>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--nd-serif), Georgia, serif',
                fontSize: '1.95rem',
                fontWeight: 700,
                lineHeight: 1.14,
                color: 'var(--text)',
              }}
            >
              Сначала расставьте приоритеты
            </h1>
            <p
              style={{
                margin: '0.75rem 0 0',
                fontFamily: 'var(--nd-serif), Georgia, serif',
                fontSize: '1.04rem',
                lineHeight: 1.55,
                color: 'var(--text-body)',
              }}
            >
              В этой сессии круги собираются по тому, что вы хотите читать{' '}
              <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>сильнее всего</em>. Добавьте
              книги в список справа и перетащите их по важности.
            </p>
          </section>
        </div>
      </Collapsible>

      {/* Persistent personal list — always mounted; board: catalog viewport,
          gate: fills the remaining screen. Never inside a Collapsible. */}
      <div
        className="p-4 pt-0"
        data-testid="matching-catalog-panel"
        style={board ? { minHeight: 560 } : { flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        {board && catalogIntro}
        <div
          className="grid"
          style={{
            gridTemplateColumns: 'minmax(0, 1.18fr) minmax(0, 0.82fr)',
            gap: '1.1rem',
            ...(board
              ? { paddingBottom: '1.6rem' }
              : { flex: '1 1 0%', minHeight: 0, gridTemplateRows: 'minmax(0, 1fr)' }),
          }}
        >
          <MatchingPersonalList
            books={books}
            bookParticipants={bookParticipants}
            viewingUserId={viewingUserId}
            mutationUserId={mutationUserId}
            priorityMutationSource={!board ? 'matching_priority_gate' : undefined}
            frozen={frozen}
            size={board ? 'compact' : 'large'}
            fill={!board}
            suppressRefresh={!board}
            onChange={!board ? setCanEnter : undefined}
          />
        </div>
      </div>

      {/* Gate footer (collapses on enter) */}
      <Collapsible open={!board}>
        <div
          className="nd-flow-fade-collapse p-4"
          style={{
            borderTop: '1px solid var(--hair)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: '46ch' }}>
            Расставьте приоритеты и сможете войти в сессию.
          </p>
          <button
            type="button"
            data-testid="ranking-gate-enter"
            disabled={!canEnter || submitting}
            onClick={enter}
            style={{
              padding: '0.9rem 1.6rem',
              border: 'none',
              borderRadius: 'var(--radius)',
              background: canEnter ? 'var(--accent)' : 'var(--border)',
              color: canEnter ? 'var(--bg-input)' : 'var(--text-muted)',
              cursor: canEnter && !submitting ? 'pointer' : 'default',
              fontFamily: 'var(--nd-sans)',
              fontSize: '0.72rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Входим…' : 'Войти в сессию →'}
          </button>
        </div>
      </Collapsible>

      {board && <MatchingRealtimeWrapper sessionId={sessionId} />}
    </div>
  )
}
