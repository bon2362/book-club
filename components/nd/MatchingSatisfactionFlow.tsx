'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import MatchingPersonalList, { type BookParticipant } from './MatchingPersonalList'
import type { CatalogBook } from '@/lib/matching/personal-list'
import { listHasCompleteActiveRanking } from '@/lib/matching/ranking-readiness'

/** sessionStorage key the gate sets before router.refresh() so the board can
 *  play its entrance animation exactly once (see MatchingBoardEntrance). */
export const MATCHING_ENTERED_KEY = 'nd-matching-entered'

export interface MatchingSatisfactionGateProps {
  sessionId: string
  books: CatalogBook[]
  bookParticipants: BookParticipant[]
  viewingUserId: string
  mutationUserId?: string
}

/**
 * Satisfaction-mode ranking gate: the one-screen step a participant sees before
 * the board. Reuses MatchingPersonalList primitives (catalog + «Мои книги» drag).
 * On «Войти в сессию» it commits priorities silently (suppressRefresh) and
 * re-renders the server tree via router.refresh(); a sessionStorage flag asks the
 * board to fade in once on arrival.
 */
export default function MatchingSatisfactionFlow({
  sessionId,
  books,
  bookParticipants,
  viewingUserId,
  mutationUserId,
}: MatchingSatisfactionGateProps) {
  const router = useRouter()
  const initialCanEnter = useMemo(() => listHasCompleteActiveRanking(books), [books])
  const [canEnter, setCanEnter] = useState(initialCanEnter)

  const enter = useCallback(() => {
    if (!canEnter) return
    try {
      sessionStorage.setItem(MATCHING_ENTERED_KEY, sessionId)
    } catch {
      // sessionStorage may be unavailable (private mode) — animation is optional.
    }
    router.refresh()
  }, [canEnter, sessionId, router])

  return (
    <main
      data-testid="ranking-gate"
      style={{
        minHeight: '100svh',
        background: 'var(--bg)',
        color: 'var(--text)',
        position: 'relative',
        padding: '2rem 1rem 0',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundImage: 'linear-gradient(var(--hair-soft) 1px, transparent 1px)',
          backgroundSize: '100% 2.1rem',
          opacity: 0.5,
          pointerEvents: 'none',
        }}
      />
      <div style={{ maxWidth: 1080, margin: '0 auto', position: 'relative' }}>
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

        <div
          className="grid"
          style={{
            gridTemplateColumns: 'minmax(0, 1.18fr) minmax(0, 0.82fr)',
            gap: '1.1rem',
            marginTop: '1.6rem',
            paddingBottom: '1.2rem',
          }}
        >
          <MatchingPersonalList
            books={books}
            bookParticipants={bookParticipants}
            viewingUserId={viewingUserId}
            mutationUserId={mutationUserId}
            size="large"
            suppressRefresh
            onChange={setCanEnter}
          />
        </div>

        <div
          style={{
            position: 'sticky',
            bottom: 0,
            marginTop: '1.4rem',
            padding: '1rem 0 1.6rem',
            background: 'var(--bg)',
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
      </div>
    </main>
  )
}
