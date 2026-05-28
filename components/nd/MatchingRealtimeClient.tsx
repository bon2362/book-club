'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface Props {
  sessionId: string
  onStateChange: (data: unknown) => void
  onPresence?: (online: string[]) => void
  onFrozen?: (payload: unknown) => void
}

const POLL_INTERVAL_MS = 3_000
const HEARTBEAT_INTERVAL_MS = 25_000
const MAX_SSE_ERRORS = 3
const SSE_BACKOFF_LIMIT_MS = 30_000

export default function MatchingRealtimeClient({ sessionId, onStateChange, onPresence, onFrozen }: Props) {
  const [mode, setMode] = useState<'sse' | 'polling'>('sse')
  const lastEventIdRef = useRef(0)
  const sseErrorsRef = useRef(0)
  const sseRef = useRef<EventSource | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const backoffMsRef = useRef(1_000)

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/matching/state?session=${sessionId}`)
      if (res.ok) {
        const data = await res.json()
        onStateChange(data)
      }
    } catch {
      // ignore network errors on poll
    }
  }, [sessionId, onStateChange])

  const sendHeartbeat = useCallback(async () => {
    try {
      await fetch(`/api/matching/sessions/${sessionId}/heartbeat`, { method: 'POST' })
    } catch {
      // ignore
    }
  }, [sessionId])

  const startPolling = useCallback(() => {
    setMode('polling')
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    pollTimerRef.current = setInterval(fetchState, POLL_INTERVAL_MS)
  }, [fetchState])

  const handleSseMessage = useCallback((event: MessageEvent) => {
    sseErrorsRef.current = 0
    backoffMsRef.current = 1_000
    try {
      const data = JSON.parse(event.data) as { type: string; event_id: number; payload: unknown }
      if (data.event_id <= lastEventIdRef.current) return
      lastEventIdRef.current = data.event_id

      if (data.type === 'state_changed') {
        fetchState()
      } else if (data.type === 'presence' && onPresence) {
        onPresence(data.payload as string[])
      } else if (data.type === 'session_frozen' && onFrozen) {
        onFrozen(data.payload)
      }
    } catch {
      // malformed event
    }
  }, [fetchState, onPresence, onFrozen])

  const connectSSE = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close()
      sseRef.current = null
    }

    const es = new EventSource(`/api/matching/stream?session=${sessionId}`)
    sseRef.current = es

    es.addEventListener('state_changed', handleSseMessage)
    es.addEventListener('presence', handleSseMessage)
    es.addEventListener('session_frozen', handleSseMessage)

    es.onerror = () => {
      sseErrorsRef.current++
      if (sseErrorsRef.current >= MAX_SSE_ERRORS && backoffMsRef.current >= SSE_BACKOFF_LIMIT_MS) {
        es.close()
        sseRef.current = null
        startPolling()
      } else {
        // exponential backoff reconnect handled by browser's EventSource
        backoffMsRef.current = Math.min(backoffMsRef.current * 2, SSE_BACKOFF_LIMIT_MS)
      }
    }
  }, [sessionId, handleSseMessage, startPolling])

  useEffect(() => {
    connectSSE()
    fetchState()

    heartbeatTimerRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)
    sendHeartbeat()

    return () => {
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null }
      if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
      if (heartbeatTimerRef.current) { clearInterval(heartbeatTimerRef.current); heartbeatTimerRef.current = null }
    }
  }, [connectSSE, fetchState, sendHeartbeat])

  return (
    <div
      data-testid="matching-realtime-indicator"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 8,
        right: 8,
        fontSize: '0.6rem',
        color: mode === 'sse' ? '#4a7' : '#999',
        fontFamily: 'var(--nd-mono), monospace',
        opacity: 0.6,
        userSelect: 'none',
      }}
    >
      {mode === 'polling' ? '⟳ синхр.' : '●'}
    </div>
  )
}
