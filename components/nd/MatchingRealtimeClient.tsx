'use client'

import { useRef, useState, useCallback } from 'react'
import { useVisibleInterval } from './use-visible-interval'
import { ACTIVE_POLL_INTERVAL_MS, adaptivePollInterval } from '@/lib/matching/poll-interval'

interface Props {
  sessionId: string
  onStateChange: () => void
  /** Фиксированный интервал (ms) — отключает адаптацию. Используется в тестах. */
  pollIntervalMs?: number
}

export default function MatchingRealtimeClient({ sessionId, onStateChange, pollIntervalMs }: Props) {
  const [healthy, setHealthy] = useState(true)
  const lastVersionRef = useRef<number | null>(null)

  // Фиксированный интервал из пропа отключает адаптацию (слой B).
  const adaptive = pollIntervalMs === undefined
  const [intervalMs, setIntervalMs] = useState(pollIntervalMs ?? ACTIVE_POLL_INTERVAL_MS)
  const [stopped, setStopped] = useState(false)

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/matching/version?session=${sessionId}`)
      if (!res.ok) {
        setHealthy(false)
        return
      }
      const data = (await res.json()) as { version: number; status?: string; online?: string[] }
      setHealthy(true)

      const versionChanged =
        lastVersionRef.current !== null && data.version !== lastVersionRef.current
      if (lastVersionRef.current === null || versionChanged) {
        lastVersionRef.current = data.version
        if (versionChanged) onStateChange()
      }

      // Слой C: заморозка терминальна (un-freeze в коде нет) и переводит доску в
      // read-only. Версия фриза уже обработана выше (refresh) — дальше опрашивать нечего.
      if (data.status === 'frozen') {
        setStopped(true)
        return
      }

      // Слой B: один в сессии → опрашиваем реже (но в пределах PRESENCE_WINDOW_MS).
      if (adaptive) {
        setIntervalMs(adaptivePollInterval(data.online?.length ?? 0))
      }
    } catch {
      setHealthy(false)
    }
  }, [sessionId, onStateChange, adaptive])

  // Опрос только при активной вкладке (слой A); останавливается на frozen (слой C).
  useVisibleInterval(poll, intervalMs, { enabled: !stopped })

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
