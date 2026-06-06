'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import MatchingPersonalList, { type BookParticipant } from './MatchingPersonalList'
import MatchingRealtimeWrapper from './MatchingRealtimeWrapper'
import type { CatalogBook } from '@/lib/matching/personal-list'
import { listHasCompleteActiveRanking } from '@/lib/matching/ranking-readiness'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/** Height collapse/expand via JS-measured max-height (reliable for arbitrary
 *  content height). Honors prefers-reduced-motion by jumping instantly. */
function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null)
  const reduced = usePrefersReducedMotion()
  const [nat, setNat] = useState<number | null>(null)
  const [settled, setSettled] = useState(open)

  useLayoutEffect(() => {
    if (innerRef.current) setNat(innerRef.current.scrollHeight)
  }, [children])

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => setSettled(true), 2600)
      return () => clearTimeout(t)
    }
    setSettled(false)
  }, [open])

  if (reduced) {
    return (
      <div style={{ maxHeight: open ? 'none' : 0, overflow: 'hidden' }}>
        <div ref={innerRef}>{children}</div>
      </div>
    )
  }

  const maxHeight: React.CSSProperties['maxHeight'] =
    nat == null ? (open ? 'none' : 0) : !open ? 0 : settled ? 'none' : nat

  return (
    <div style={{ maxHeight, overflow: 'hidden', transition: 'max-height 2.4s cubic-bezier(0.22, 1, 0.36, 1)' }}>
      <div ref={innerRef}>{children}</div>
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
 * The personal list (catalog + «Мои книги») is rendered once and stays mounted
 * across the transition; on «Войти в сессию» the gate intro/footer collapse and
 * the board chrome (header + scenarios/moves) slides in from the top. page.tsx
 * renders this component at the same tree position in both phases, so
 * router.refresh() preserves client state and the board streams in.
 *
 * Board phase reproduces the regular board layout exactly (full-width, a 100svh
 * first viewport with header + workspace, the catalog below) — so the morph ends
 * on the same board coverage mode shows.
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
  const [entering, setEntering] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const isBoard = board || entering

  useEffect(() => {
    if (isBoard) window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [isBoard])

  // When morphing in from the gate, reveal the scenarios/moves after the board
  // chrome has slid in. Direct board loads skip this (no entering → no stagger).
  useEffect(() => {
    if (!entering) return
    const t = setTimeout(() => setLoaded(true), 1800)
    return () => clearTimeout(t)
  }, [entering])

  const enter = useCallback(() => {
    if (!canEnter || board || entering) return
    setEntering(true) // start the morph immediately; server confirms board next
    router.refresh()
  }, [canEnter, board, entering, router])

  return (
    <div
      className={'nd-flow flex flex-col' + (isBoard ? ' is-board' : '')}
      style={{
        background: 'var(--bg)',
        color: 'var(--text)',
        ...(isBoard ? { minHeight: '100svh' } : { height: '100svh', overflow: 'hidden' }),
      }}
    >
      {/* Board chrome: header + workspace fill the first viewport (slides in) */}
      <Collapsible open={isBoard}>
        <div className="nd-flow-slide-from-top flex flex-col" style={{ height: '100svh' }}>
          {header}
          <div className="flex-1 min-h-0 p-4">
            <div
              className={entering ? `nd-flow-stagger${loaded ? ' is-loaded' : ''}` : undefined}
              style={{ height: '100%' }}
            >
              {workspace}
            </div>
          </div>
        </div>
      </Collapsible>

      {/* Gate intro (collapses on enter) */}
      <Collapsible open={!isBoard}>
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
        style={isBoard ? { minHeight: 560 } : { flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        {isBoard && catalogIntro}
        <div
          className="grid"
          style={{
            gridTemplateColumns: 'minmax(0, 1.18fr) minmax(0, 0.82fr)',
            gap: '1.1rem',
            ...(isBoard
              ? { paddingBottom: '1.6rem' }
              : { flex: '1 1 0%', minHeight: 0, gridTemplateRows: 'minmax(0, 1fr)' }),
          }}
        >
          <MatchingPersonalList
            books={books}
            bookParticipants={bookParticipants}
            viewingUserId={viewingUserId}
            mutationUserId={mutationUserId}
            frozen={frozen}
            size={isBoard ? 'compact' : 'large'}
            fill={!isBoard}
            suppressRefresh={!isBoard}
            onChange={!isBoard ? setCanEnter : undefined}
          />
        </div>
      </div>

      {/* Gate footer (collapses on enter) */}
      <Collapsible open={!isBoard}>
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
            disabled={!canEnter}
            onClick={enter}
            style={{
              padding: '0.9rem 1.6rem',
              border: 'none',
              borderRadius: 'var(--radius)',
              background: canEnter ? 'var(--accent)' : 'var(--border)',
              color: canEnter ? 'var(--bg-input)' : 'var(--text-muted)',
              cursor: canEnter ? 'pointer' : 'default',
              fontFamily: 'var(--nd-sans)',
              fontSize: '0.72rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            Войти в сессию →
          </button>
        </div>
      </Collapsible>

      {board && <MatchingRealtimeWrapper sessionId={sessionId} />}
    </div>
  )
}
