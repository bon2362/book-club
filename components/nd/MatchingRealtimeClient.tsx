'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { useVisibleInterval } from './use-visible-interval'
import { ACTIVE_POLL_INTERVAL_MS, adaptivePollInterval } from '@/lib/matching/poll-interval'
import MatchingNotices from './MatchingNotices'
import MatchingLockedCircles from './MatchingLockedCircles'
import MatchingScenarios from './MatchingScenarios'
import type { MatchingNotice } from './MatchingNotices'
import type { LockedCircle } from './MatchingLockedCircles'
import type { PublicScenario, ScenarioBookMeta } from './MatchingScenarios'
import MatchingHeader, { type MatchingHeaderParticipant } from './MatchingHeader'
import MatchingWorkspace from './MatchingWorkspace'
import MatchingBooksView from './MatchingBooksView'
import MatchingModeTabs, { type MatchingMode } from './MatchingModeTabs'
import type { MatchingBookModeState } from './matching-book-types'
import MatchingBookAdminToolbar from './MatchingBookAdminToolbar'
import { useRouter } from 'next/navigation'

export interface MatchingPublicState {
  session: {
    name: string
    status: string
    stateVersion: number
    minGroupSize: number
    maxGroupSize: number
    deadlineAt: string | null
  }
  viewer: {
    role: 'active' | 'observer'
    ref: string
    lockedCircleKey: string | null
  }
  participants: MatchingHeaderParticipant[]
  scenarios: PublicScenario[]
  lockedCircles: LockedCircle[]
  notices: MatchingNotice[]
  /** The viewer's confirmed circleKey, derived from participants */
  viewerConfirmedCircleKey: string | null
  /** Null until the one-time live-session initialization commits. */
  bookMode?: MatchingBookModeState | null
}

interface Props {
  sessionId: string
  initialState: MatchingPublicState
  booksById?: Record<string, ScenarioBookMeta>
  /** Transitional test compatibility; production passes full metadata. */
  bookTitleById?: Record<string, string>
  /** Optional fixed poll interval in ms — overrides adaptive logic. Used in tests. */
  pollIntervalMs?: number
  isAdmin?: boolean
  isImpersonating?: boolean
  viewerDisplayName?: string
}

/** Extract viewer's confirmedCircleKey from public state participants */
function extractViewerConfirmedKey(
  raw: { participants?: Array<{ ref: string; confirmedCircleKey: string | null }>; viewer?: { ref: string } } | null,
): string | null {
  if (!raw?.participants || !raw?.viewer) return null
  const me = raw.participants.find((p) => p.ref === raw.viewer!.ref)
  return me?.confirmedCircleKey ?? null
}

export default function MatchingRealtimeClient({
  sessionId,
  initialState,
  booksById,
  bookTitleById = {},
  pollIntervalMs,
  isAdmin = false,
  isImpersonating = false,
  viewerDisplayName,
}: Props) {
  const router = useRouter()
  const resolvedBooksById = booksById ?? Object.fromEntries(Object.entries(bookTitleById).map(([bookId, title]) => [bookId, { bookId, title, author: '', description: '', coverUrl: null, pages: null, publishedDate: '', textUrl: '', whyRead: null, recommendationLink: null, tags: [] }]))
  const [state, setState] = useState<MatchingPublicState>(initialState)
  const [mode, setMode] = useState<MatchingMode>(initialState.bookMode ? 'books' : 'scenarios')
  const hadBookModeRef = useRef(Boolean(initialState.bookMode))
  const [healthy, setHealthy] = useState(true)
  const lastVersionRef = useRef<number | null>(null)

  const adaptive = pollIntervalMs === undefined
  const [intervalMs, setIntervalMs] = useState(pollIntervalMs ?? ACTIVE_POLL_INTERVAL_MS)
  const [stopped, setStopped] = useState(false)

  const fetchFullState = useCallback(async () => {
    try {
      const res = await fetch(`/api/matching/state?session=${sessionId}`)
      if (!res.ok) return
      const raw = await res.json()
      // Derive viewerConfirmedCircleKey from the raw payload
      const viewerConfirmedCircleKey = extractViewerConfirmedKey(raw)
      setState({
        session: raw.session,
        viewer: raw.viewer,
        participants: raw.participants,
        scenarios: raw.scenarios,
        lockedCircles: raw.lockedCircles,
        notices: raw.notices,
        viewerConfirmedCircleKey,
        bookMode: raw.bookMode ?? null,
      })
    } catch {
      // non-fatal; state stays stale until next poll
    }
  }, [sessionId])

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/matching/version?session=${sessionId}`)
      if (!res.ok) {
        setHealthy(false)
        return
      }
      const data = (await res.json()) as { version: number; status?: string; online?: string[] }
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

      const versionChanged =
        lastVersionRef.current !== null && data.version !== lastVersionRef.current
      if (lastVersionRef.current === null || versionChanged) {
        lastVersionRef.current = data.version
        if (versionChanged) {
          await fetchFullState()
          router.refresh()
        }
      }

      if (data.status === 'frozen') {
        setStopped(true)
        return
      }

      if (adaptive) {
        setIntervalMs(adaptivePollInterval(data.online?.length ?? 0))
      }
    } catch {
      setHealthy(false)
    }
  }, [sessionId, adaptive, fetchFullState, router])

  // On mount: initialise lastVersion from initialState so we don't trigger a
  // fetch on the first poll if nothing changed.
  useEffect(() => {
    lastVersionRef.current = initialState.session.stateVersion
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useVisibleInterval(poll, intervalMs, { enabled: !stopped })

  useEffect(() => {
    if (state.bookMode && !hadBookModeRef.current) setMode('books')
    hadBookModeRef.current = Boolean(state.bookMode)
  }, [state.bookMode])

  const applyCanonicalState = useCallback((raw: unknown) => {
    if (!raw || typeof raw !== 'object') return
    const next = raw as Partial<MatchingPublicState>
    setState((current) => {
      if (!next.session) {
        return next.bookMode !== undefined ? { ...current, bookMode: next.bookMode } : current
      }
      return {
        ...current,
        ...next,
        viewerConfirmedCircleKey: extractViewerConfirmedKey(next as Parameters<typeof extractViewerConfirmedKey>[0]),
      }
    })
  }, [])

  return (
    <div data-testid="matching-realtime-client" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <MatchingHeader
        sessionId={sessionId}
        sessionName={state.session.name}
        sessionStatus={state.session.status}
        stateVersion={state.session.stateVersion}
        minGroupSize={state.session.minGroupSize}
        maxGroupSize={state.session.maxGroupSize}
        deadlineAt={state.session.deadlineAt}
        viewer={{
          displayName: viewerDisplayName ?? (isAdmin && !isImpersonating
            ? 'Организатор'
            : state.participants.find((participant) => participant.ref === state.viewer.ref)?.displayName ?? 'Участник'),
          role: isAdmin && !isImpersonating ? 'active' : state.viewer.role,
        }}
        participants={state.participants}
        isAdmin={isAdmin}
        isImpersonating={isImpersonating}
        viewerAssigned={Boolean(state.bookMode?.viewerAssignmentBookId)}
        bookMode={Boolean(state.bookMode)}
        onSessionRefresh={fetchFullState}
      />
      {isAdmin && !isImpersonating && (
        <MatchingBookAdminToolbar
          sessionId={sessionId}
          sessionStatus={state.session.status}
          stateVersion={state.session.stateVersion}
          initialized={Boolean(state.bookMode)}
          onState={applyCanonicalState}
          onRefresh={fetchFullState}
        />
      )}
      {state.bookMode && <MatchingModeTabs value={mode} onChange={setMode} />}
      {/* Health indicator */}
      <div
        data-testid="matching-realtime-indicator"
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: 8,
          right: 8,
          fontSize: '0.6rem',
          color: healthy ? 'var(--success)' : 'var(--text-muted)',
          fontFamily: 'var(--nd-mono), monospace',
          opacity: 0.6,
          userSelect: 'none',
        }}
      >
        {healthy ? '●' : '⟳ синхр.'}
      </div>

      <MatchingWorkspace>
      {state.bookMode && mode === 'books' ? (
        <div role="tabpanel" id="matching-panel-books" aria-labelledby="matching-tab-books">
          <MatchingBooksView
            sessionId={sessionId}
            stateVersion={state.session.stateVersion}
            sessionStatus={state.session.status}
            viewerRef={state.viewer.ref}
            bookMode={state.bookMode}
            booksById={resolvedBooksById}
            isAdmin={isAdmin && !isImpersonating}
            onState={applyCanonicalState}
            onRefresh={fetchFullState}
          />
        </div>
      ) : (
      <div role={state.bookMode ? 'tabpanel' : undefined} id={state.bookMode ? 'matching-panel-scenarios' : undefined} aria-labelledby={state.bookMode ? 'matching-tab-scenarios' : undefined}>
      {/* Notices at top */}
      {state.notices.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <MatchingNotices sessionId={sessionId} notices={state.notices} />
        </div>
      )}

      {/* Locked circles registry above live scenarios */}
      <MatchingLockedCircles
        circles={state.lockedCircles}
        viewerLockedCircleKey={state.viewer.lockedCircleKey}
        booksById={resolvedBooksById}
      />

      {/* Scenarios board */}
      <div style={{ marginTop: state.lockedCircles.length > 0 ? '1.4rem' : 0 }}>
        <MatchingScenarios
          sessionId={sessionId}
          stateVersion={state.session.stateVersion}
          scenarios={state.scenarios}
          viewerConfirmedCircleKey={state.viewerConfirmedCircleKey}
          viewerRole={state.viewer.role}
          frozen={state.session.status === 'frozen' || state.session.status === 'closed' || Boolean(state.bookMode)}
          booksById={resolvedBooksById}
          onConfirmationChange={fetchFullState}
        />
      </div>
      </div>
      )}
      </MatchingWorkspace>
    </div>
  )
}
