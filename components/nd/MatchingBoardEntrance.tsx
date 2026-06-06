'use client'

import { useLayoutEffect, useState } from 'react'
import { MATCHING_ENTERED_KEY } from './MatchingSatisfactionFlow'

type Phase = 'idle' | 'hidden' | 'shown'

/**
 * Fades the matching board in once, only when the viewer just arrived from the
 * satisfaction ranking gate (the gate sets a sessionStorage flag before
 * router.refresh()). Normal loads and realtime refreshes render the board
 * instantly. Opacity-only — no transform — so it never creates a containing
 * block for position:fixed descendants (realtime indicator, modals).
 */
export default function MatchingBoardEntrance({
  sessionId,
  children,
}: {
  sessionId: string
  children: React.ReactNode
}) {
  const [phase, setPhase] = useState<Phase>('idle')

  useLayoutEffect(() => {
    let entered = false
    try {
      entered = sessionStorage.getItem(MATCHING_ENTERED_KEY) === sessionId
      if (entered) sessionStorage.removeItem(MATCHING_ENTERED_KEY)
    } catch {
      // sessionStorage unavailable — skip the animation.
    }
    if (!entered) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    // Hide before paint (useLayoutEffect runs pre-paint → no flash), then reveal.
    setPhase('hidden')
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPhase('shown'))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [sessionId])

  const style: React.CSSProperties =
    phase === 'hidden'
      ? { opacity: 0 }
      : phase === 'shown'
        ? { opacity: 1, transition: 'opacity 0.7s ease' }
        : {}

  return <div style={style}>{children}</div>
}
