'use client'

/**
 * MatchingRealtimeWrapper — лёгкий опросчик версии для частей страницы без полного
 * MatchingRealtimeClient (например, personal list внутри MatchingSatisfactionFlow).
 * При изменении версии делает router.refresh() чтобы получить свежие серверные данные.
 *
 * Если MatchingRealtimeClient уже монтирован на той же странице, он управляет
 * главным board-контентом; MatchingRealtimeWrapper отвечает только за refresh каталога.
 */
import { useCallback } from 'react'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useVisibleInterval } from './use-visible-interval'
import { ACTIVE_POLL_INTERVAL_MS } from '@/lib/matching/poll-interval'

interface Props {
  sessionId: string
}

export default function MatchingRealtimeWrapper({ sessionId }: Props) {
  const router = useRouter()
  const lastVersionRef = useRef<number | null>(null)
  const [stopped, setStopped] = useState(false)

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/matching/version?session=${sessionId}`)
      if (!res.ok) return
      const data = (await res.json()) as { version: number; status?: string }

      const versionChanged =
        lastVersionRef.current !== null && data.version !== lastVersionRef.current
      if (lastVersionRef.current === null || versionChanged) {
        lastVersionRef.current = data.version
        if (versionChanged) router.refresh()
      }

      if (data.status === 'frozen') setStopped(true)
    } catch {
      // non-fatal
    }
  }, [sessionId, router])

  useVisibleInterval(poll, ACTIVE_POLL_INTERVAL_MS, { enabled: !stopped })

  return null
}
