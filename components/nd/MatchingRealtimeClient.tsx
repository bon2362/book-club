'use client'

import { useRef, useState, useCallback } from 'react'
import { useVisibleInterval } from './use-visible-interval'

interface Props {
  sessionId: string
  onStateChange: () => void
  /** Override poll interval (ms). Useful in tests. Defaults to 3000. */
  pollIntervalMs?: number
}

const DEFAULT_POLL_INTERVAL_MS = 3_000

export default function MatchingRealtimeClient({ sessionId, onStateChange, pollIntervalMs }: Props) {
  const [healthy, setHealthy] = useState(true)
  const lastVersionRef = useRef<number | null>(null)
  const intervalMs = pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/matching/version?session=${sessionId}`)
      if (!res.ok) {
        setHealthy(false)
        return
      }
      const data = (await res.json()) as { version: number }
      setHealthy(true)
      if (lastVersionRef.current === null) {
        lastVersionRef.current = data.version
        return
      }
      if (data.version !== lastVersionRef.current) {
        lastVersionRef.current = data.version
        onStateChange()
      }
    } catch {
      setHealthy(false)
    }
  }, [sessionId, onStateChange])

  // Опрос только при активной вкладке: фоновые вкладки не будят serverless-функцию.
  useVisibleInterval(poll, intervalMs)

  return (
    <div
      data-testid="matching-realtime-indicator"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 8,
        right: 8,
        fontSize: '0.6rem',
        color: healthy ? '#4a7' : 'var(--text-muted)',
        fontFamily: 'var(--nd-mono), monospace',
        opacity: 0.6,
        userSelect: 'none',
      }}
    >
      {healthy ? '●' : '⟳ синхр.'}
    </div>
  )
}
