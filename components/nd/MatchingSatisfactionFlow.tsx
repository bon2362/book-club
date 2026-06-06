'use client'

import { useMemo, useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
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
      const t = setTimeout(() => setSettled(true), 3300)
      return () => clearTimeout(t)
    }
    setSettled(false)
  }, [open])

  if (reduced) {
    return <div style={{ maxHeight: open ? 'none' : 0, overflow: 'hidden' }}><div ref={innerRef}>{children}</div></div>
  }

  const maxHeight: React.CSSProperties['maxHeight'] =
    nat == null ? (open ? 'none' : 0) : !open ? 0 : settled ? 'none' : nat

  return (
    <div style={{ maxHeight, overflow: 'hidden', transition: 'max-height 3.1s cubic-bezier(0.22, 1, 0.36, 1)' }}>
      <div ref={innerRef}>{children}</div>
    </div>
  )
}

export default function MatchingSatisfactionFlow(props: MatchingSatisfactionFlowProps) {
  const { phase, books, bookParticipants, viewingUserId, mutationUserId, frozen, sessionId } = props
  const router = useRouter()
  const board = phase === 'board'

  const initialCanEnter = useMemo(() => listHasCompleteActiveRanking(books), [books])
  const [canEnter, setCanEnter] = useState(initialCanEnter)

  const [entering, setEntering] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const isBoard = board || entering

  // Once the server switches us to the board phase, reveal staggered content.
  useEffect(() => {
    if (board) {
      const t = setTimeout(() => setLoaded(true), 50)
      return () => clearTimeout(t)
    }
  }, [board])

  // Smooth scroll to top as the board reveals.
  useEffect(() => {
    if (isBoard) window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [isBoard])

  const enter = useCallback(() => {
    if (!canEnter || board || entering) return
    setEntering(true)   // start fade/slide immediately
    router.refresh()    // server returns phase='board' with scenarios
  }, [canEnter, board, entering, router])

  return (
    <div
      className={'nd-flow' + (isBoard ? ' is-board' : '')}
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
          ...(isBoard ? { minHeight: '100svh' } : { height: '100svh' }),
        }}
      >
        <Collapsible open={isBoard}>
          <div className="nd-flow-slide-from-top">{props.header}</div>
        </Collapsible>

        <Collapsible open={!isBoard}>
          <div className="nd-flow-fade-collapse" data-testid="ranking-gate" style={{ maxWidth: 640, padding: '2.2rem 0 0.4rem' }}>
            <h1 style={{ margin: 0, fontFamily: 'var(--nd-serif)', fontSize: '1.95rem', lineHeight: 1.14, fontWeight: 700, color: 'var(--text)' }}>
              Сначала расставьте приоритеты
            </h1>
            <p style={{ margin: '0.7rem 0 1.5rem', fontFamily: 'var(--nd-serif)', fontSize: '1.04rem', lineHeight: 1.55, color: 'var(--text-body)' }}>
              В этой сессии круги собираются по тому, что вы хотите читать{' '}
              <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>сильнее всего</em>.
              {' '}Добавьте книги в список справа и перетащите их по важности.
            </p>
          </div>
        </Collapsible>

        <Collapsible open={isBoard}>
          <div className="nd-flow-slide-from-top">
            <div className={'nd-flow-stagger' + (loaded ? ' is-loaded' : '')} style={{ transitionDelay: loaded ? '240ms' : '0ms' }}>
              {props.workspace}
            </div>
          </div>
        </Collapsible>

        <div style={{ paddingBottom: isBoard ? '2.4rem' : '1.2rem', ...(isBoard ? { flex: '0 0 auto' } : { flex: '1 1 0%', minHeight: 0 }) }}>
          {isBoard && props.catalogIntro}
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

        <Collapsible open={!isBoard}>
          <div className="nd-flow-fade-collapse" style={{ borderTop: '1px solid var(--hair)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', padding: '1.2rem 0 2rem' }}>
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
        </Collapsible>
      </div>

      {board && <MatchingRealtimeWrapper sessionId={sessionId} />}
    </div>
  )
}
