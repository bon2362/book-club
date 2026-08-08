'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useVisibleInterval } from './use-visible-interval'
import { ACTIVE_POLL_INTERVAL_MS, adaptivePollInterval } from '@/lib/matching/poll-interval'
import MatchingNotices, { type MatchingNotice } from './MatchingNotices'
import MatchingHeader, { type MatchingHeaderParticipant } from './MatchingHeader'
import MatchingWorkspace from './MatchingWorkspace'
import MatchingBooksView from './MatchingBooksView'
import MatchingBookAdminToolbar from './MatchingBookAdminToolbar'
import type { MatchingBookModeState } from './matching-book-types'
import type { MatchingBookDetail } from './MatchingBookDetailModal'

export interface MatchingPublicState {
  session: {
    name: string
    status: string
    stateVersion: number
    deadlineAt: string | null
  }
  viewer: { role: 'active' | 'observer'; ref: string }
  participants: MatchingHeaderParticipant[]
  notices: MatchingNotice[]
  bookMode: MatchingBookModeState
}

interface Props {
  sessionId: string
  initialState: MatchingPublicState
  booksById?: Record<string, MatchingBookDetail>
  bookTitleById?: Record<string, string>
  pollIntervalMs?: number
  isAdmin?: boolean
  isImpersonating?: boolean
  impersonatedUserId?: string
  viewerDisplayName?: string
}

export default function MatchingRealtimeClient({
  sessionId,
  initialState,
  booksById,
  bookTitleById = {},
  pollIntervalMs,
  isAdmin = false,
  isImpersonating = false,
  impersonatedUserId,
  viewerDisplayName,
}: Props) {
  const router = useRouter()
  const resolvedBooksById = booksById ?? Object.fromEntries(Object.entries(bookTitleById).map(([bookId, title]) => [bookId, {
    bookId, title, author: '', description: '', coverUrl: null, pages: null,
    publishedDate: '', textUrl: '', whyRead: null, recommendationLink: null, tags: [],
  }]))
  const [state, setState] = useState(initialState)
  const [healthy, setHealthy] = useState(true)
  const lastVersionRef = useRef<number | null>(null)
  const adaptive = pollIntervalMs === undefined
  const [intervalMs, setIntervalMs] = useState(pollIntervalMs ?? ACTIVE_POLL_INTERVAL_MS)
  const [stopped, setStopped] = useState(false)

  const fetchFullState = useCallback(async () => {
    try {
      const impersonationQuery = impersonatedUserId ? `&as=${encodeURIComponent(impersonatedUserId)}` : ''
      const res = await fetch(`/api/matching/state?session=${sessionId}${impersonationQuery}`)
      if (!res.ok) return false
      setState(await res.json() as MatchingPublicState)
      return true
    } catch {
      return false
    }
  }, [sessionId, impersonatedUserId])

  const refreshFullState = useCallback(async () => { await fetchFullState() }, [fetchFullState])

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/matching/version?session=${sessionId}`)
      if (!res.ok) { setHealthy(false); return }
      const data = await res.json() as { version: number; status?: string; online?: string[] }
      setHealthy(true)
      if (data.online) {
        setState((current) => ({
          ...current,
          participants: current.participants.map((participant) => ({
            ...participant,
            online: data.online!.includes(participant.ref),
          })),
        }))
      }
      const versionChanged = lastVersionRef.current !== null && data.version !== lastVersionRef.current
      if (lastVersionRef.current === null) lastVersionRef.current = data.version
      else if (versionChanged) {
        if (!await fetchFullState()) { setHealthy(false); return }
        lastVersionRef.current = data.version
        router.refresh()
      }
      if (data.status === 'closed') { setStopped(true); return }
      if (adaptive) setIntervalMs(adaptivePollInterval(data.online?.length ?? 0))
    } catch {
      setHealthy(false)
    }
  }, [sessionId, adaptive, fetchFullState, router])

  useEffect(() => {
    setState(initialState)
    lastVersionRef.current = initialState.session.stateVersion
  }, [initialState, impersonatedUserId])

  useVisibleInterval(poll, intervalMs, { enabled: !stopped })

  const applyCanonicalState = useCallback((raw: unknown) => {
    if (!raw || typeof raw !== 'object') return
    const next = raw as Partial<MatchingPublicState>
    setState((current) => next.session
      ? { ...current, ...next } as MatchingPublicState
      : next.bookMode ? { ...current, bookMode: next.bookMode } : current)
  }, [])

  return (
    <div data-testid="matching-realtime-client" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <MatchingHeader
        sessionId={sessionId}
        sessionName={state.session.name}
        sessionStatus={state.session.status}
        stateVersion={state.session.stateVersion}
        deadlineAt={state.session.deadlineAt}
        viewer={{
          ref: state.viewer.ref,
          displayName: viewerDisplayName ?? (isAdmin && !isImpersonating
            ? 'Организатор'
            : state.participants.find((participant) => participant.ref === state.viewer.ref)?.displayName ?? 'Участник'),
          role: isAdmin && !isImpersonating ? 'active' : state.viewer.role,
        }}
        participants={state.participants}
        isAdmin={isAdmin}
        isImpersonating={isImpersonating}
        viewerAssigned={Boolean(state.bookMode.viewerAssignmentBookId)}
        onSessionRefresh={refreshFullState}
      />
      {isAdmin && !isImpersonating && (
        <MatchingBookAdminToolbar
          sessionId={sessionId}
          sessionStatus={state.session.status}
          stateVersion={state.session.stateVersion}
          onState={applyCanonicalState}
          onRefresh={refreshFullState}
        />
      )}
      <div data-testid="matching-realtime-indicator" aria-live="polite" style={{
        position: 'fixed', bottom: 8, right: 8, fontSize: '0.6rem',
        color: healthy ? 'var(--success)' : 'var(--text-muted)',
        fontFamily: 'var(--nd-mono), monospace', opacity: 0.6, userSelect: 'none',
      }}>{healthy ? '●' : '⟳ синхр.'}</div>
      <MatchingWorkspace natural>
        {state.notices.length > 0 && (
          <div style={{ marginBottom: '1rem' }}><MatchingNotices sessionId={sessionId} notices={state.notices} /></div>
        )}
        <MatchingBooksView
          sessionId={sessionId}
          stateVersion={state.session.stateVersion}
          sessionStatus={state.session.status}
          viewerRef={state.viewer.ref}
          bookMode={state.bookMode}
          booksById={resolvedBooksById}
          isAdmin={isAdmin && !isImpersonating}
          mutationUserId={impersonatedUserId}
          onState={applyCanonicalState}
          onRefresh={refreshFullState}
        />
      </MatchingWorkspace>
    </div>
  )
}
