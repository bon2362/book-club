'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import AdminMatchingSessionBar, { AdminMatchingNewSessionForm } from './AdminMatchingSessionBar'
import AdminMatchingSummary from './AdminMatchingSummary'
import AdminMatchingBookDemand from './AdminMatchingBookDemand'
import AdminMatchingParticipantsTab from './AdminMatchingParticipantsTab'
import AdminMatchingLogTab from './AdminMatchingLogTab'
import AdminMatchingInstructions from './AdminMatchingInstructions'
import {
  MATCHING_SUB_TABS,
  focusRing,
  parseMatchingSubTab,
  participantDisplayName,
  quietText,
  type AllUser,
  type CoordinationData,
  type MatchingEvent,
  type MatchingSession,
  type MatchingSubTab,
  type Participant,
} from './admin-matching-shared'

// Админская вкладка «Матчинг»: строка сессии → сводка → подвкладки
// «Спрос по книгам» (по умолчанию) · «Участники» · «Журнал». Подвкладка живёт в `?sub=`.

export default function AdminMatchingSession() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const subParam = searchParams.get('sub')
  const searchParamsString = searchParams.toString()
  const [subTab, setSubTab] = useState<MatchingSubTab>(() => parseMatchingSubTab(subParam))

  const [sessions, setSessions] = useState<MatchingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const selectedSessionIdRef = useRef<string | null>(null)
  const [newSessionOpen, setNewSessionOpen] = useState(false)
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [lifecycleError, setLifecycleError] = useState<string | null>(null)

  const [coordination, setCoordination] = useState<CoordinationData | null>(null)
  const [coordinationLoading, setCoordinationLoading] = useState(false)
  const [coordinationError, setCoordinationError] = useState<string | null>(null)

  const [participants, setParticipants] = useState<Participant[]>([])
  const [onlinePublicRefs, setOnlinePublicRefs] = useState<Set<string>>(new Set())
  const [participantsLoading, setParticipantsLoading] = useState(false)
  const [allUsers, setAllUsers] = useState<AllUser[]>([])
  const [addingParticipant, setAddingParticipant] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)

  const [events, setEvents] = useState<MatchingEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)

  // Back/forward в браузере меняют `?sub=` — подхватываем.
  useEffect(() => { setSubTab(parseMatchingSubTab(subParam)) }, [subParam])

  const selectSubTab = useCallback((next: MatchingSubTab) => {
    setSubTab(next)
    const params = new URLSearchParams(searchParamsString)
    params.set('sub', next)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [pathname, router, searchParamsString])

  const loadSessions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/matching/sessions')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Ошибка загрузки')
      setSessions(json.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }, [])

  // Ответы по уже не выбранной сессии отбрасываем (сверка с selectedSessionIdRef):
  // переключение сессий не должно смешивать данные.
  const loadCoordination = useCallback(async (sessionId: string) => {
    setCoordinationLoading(true)
    try {
      const res = await fetch(`/api/admin/matching/sessions/${sessionId}/coordination`)
      const json = await res.json()
      if (selectedSessionIdRef.current !== sessionId) return
      if (!res.ok) throw new Error(json.error ?? 'Не удалось загрузить спрос по книгам')
      setCoordination({ summary: json.summary, books: json.books ?? [] })
      setCoordinationError(null)
    } catch (e) {
      if (selectedSessionIdRef.current === sessionId) setCoordinationError(e instanceof Error ? e.message : 'Неизвестная ошибка')
    } finally {
      if (selectedSessionIdRef.current === sessionId) setCoordinationLoading(false)
    }
  }, [])

  const loadParticipants = useCallback(async (sessionId: string) => {
    setParticipantsLoading(true)
    try {
      const res = await fetch(`/api/admin/matching/sessions/${sessionId}/participants`)
      const json = await res.json()
      if (res.ok && selectedSessionIdRef.current === sessionId) {
        setParticipants(json.data ?? [])
        // Online list contains publicRefs; store as-is for best-effort display.
        setOnlinePublicRefs(new Set<string>(json.online ?? []))
      }
    } finally {
      if (selectedSessionIdRef.current === sessionId) setParticipantsLoading(false)
    }
  }, [])

  const loadEvents = useCallback(async (sessionId: string) => {
    setEventsLoading(true)
    try {
      const res = await fetch(`/api/admin/matching/preference-events?sessionId=${encodeURIComponent(sessionId)}&limit=100`)
      const json = await res.json()
      if (res.ok && selectedSessionIdRef.current === sessionId) setEvents(json.events ?? [])
    } finally {
      if (selectedSessionIdRef.current === sessionId) setEventsLoading(false)
    }
  }, [])

  useEffect(() => { loadSessions() }, [loadSessions])

  useEffect(() => {
    fetch('/api/admin/users')
      .then(async (res) => {
        const json = await res.json()
        if (res.ok) setAllUsers(json.data ?? [])
      })
      .catch(() => {})
  }, [])

  // Default selection: current writable session, otherwise the most recent one.
  useEffect(() => {
    if (sessions.length === 0) return
    setSelectedSessionId((prev) => {
      if (prev && sessions.some((session) => session.id === prev)) return prev
      return (sessions.find((session) => session.status === 'open') ?? sessions[0]).id
    })
  }, [sessions])

  // Load data for the selected session.
  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId
    if (!selectedSessionId) return
    setCoordination(null)
    setCoordinationError(null)
    setParticipants([])
    setOnlinePublicRefs(new Set())
    setEvents([])
    loadCoordination(selectedSessionId)
    loadParticipants(selectedSessionId)
    loadEvents(selectedSessionId)
  }, [selectedSessionId, loadCoordination, loadParticipants, loadEvents])

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null
  const openSession = sessions.find((session) => session.status === 'open')
  const isSelectedOpen = selectedSession?.status === 'open'

  async function handleAddParticipant(userId: string): Promise<boolean> {
    if (!selectedSession || !isSelectedOpen) return false
    setAddingParticipant(true)
    try {
      const res = await fetch(`/api/admin/matching/sessions/${selectedSession.id}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) return false
      await Promise.all([loadParticipants(selectedSession.id), loadCoordination(selectedSession.id)])
      return true
    } finally {
      setAddingParticipant(false)
    }
  }

  async function handleRemoveParticipant(participant: Participant) {
    if (!selectedSession || !isSelectedOpen) return
    if (!window.confirm(`Убрать ${participantDisplayName(participant)} из сессии «${selectedSession.name}»?`)) return
    setRemovingUserId(participant.userId)
    try {
      const res = await fetch(
        `/api/admin/matching/sessions/${selectedSession.id}/participants/${participant.userId}`,
        { method: 'DELETE' },
      )
      if (res.ok) await Promise.all([loadParticipants(selectedSession.id), loadCoordination(selectedSession.id)])
    } finally {
      setRemovingUserId(null)
    }
  }

  async function handleLifecycle(action: 'closeSession' | 'reopenSession') {
    if (!selectedSession) return
    const label = action === 'closeSession' ? 'Закрыть' : 'Снова открыть'
    if (!window.confirm(`${label} сессию «${selectedSession.name}»?`)) return
    setLifecycleBusy(true)
    setLifecycleError(null)
    try {
      const res = await fetch(`/api/admin/matching/sessions/${selectedSession.id}/book-admin-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, expectedStateVersion: selectedSession.stateVersion }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Не удалось изменить состояние сессии')
      await loadSessions()
    } catch (e) {
      setLifecycleError(e instanceof Error ? e.message : 'Неизвестная ошибка')
    } finally {
      setLifecycleBusy(false)
    }
  }

  async function handleCreateSession(input: { name: string; deadlineAt: string | null }) {
    const res = await fetch('/api/matching/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Ошибка создания')
    setNewSessionOpen(false)
    if (json.data?.id) setSelectedSessionId(json.data.id)
    await loadSessions()
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const step = event.key === 'ArrowRight' ? 1 : -1
    const next = MATCHING_SUB_TABS[(index + step + MATCHING_SUB_TABS.length) % MATCHING_SUB_TABS.length]
    selectSubTab(next.id)
    document.getElementById(`admin-matching-tab-${next.id}`)?.focus()
  }

  const tabCounts: Record<MatchingSubTab, number | null | undefined> = {
    instructions: undefined,
    demand: coordination ? coordination.books.length : null,
    people: participantsLoading && participants.length === 0 ? null : participants.length,
    log: eventsLoading && events.length === 0 ? null : events.length,
  }

  return (
    <div data-testid="admin-matching" style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.82rem', padding: '1.2rem 0' }}>
      {loading && sessions.length === 0 && <p style={quietText}>Загрузка…</p>}
      {error && <p style={{ ...quietText, color: 'var(--accent)' }}>{error}</p>}

      {!loading && sessions.length === 0 && !newSessionOpen && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
          <p style={quietText}>Сессий пока нет.</p>
          <button
            type="button"
            onClick={() => setNewSessionOpen(true)}
            className={focusRing}
            style={{ fontSize: '0.76rem', color: 'var(--text-body)', textDecoration: 'underline', cursor: 'pointer' }}
            data-testid="admin-matching-new-session"
          >
            + Новая сессия
          </button>
        </div>
      )}

      {selectedSession && subTab !== 'instructions' && (
        <>
          <AdminMatchingSessionBar
            sessions={sessions}
            session={selectedSession}
            activeParticipants={coordination?.summary.activeParticipants ?? null}
            lifecycleBusy={lifecycleBusy}
            lifecycleError={lifecycleError}
            onSelect={setSelectedSessionId}
            onNewSession={() => setNewSessionOpen(true)}
            onLifecycle={handleLifecycle}
          />
          <AdminMatchingSummary summary={coordination?.summary ?? null} />
        </>
      )}

      {newSessionOpen && (
        <AdminMatchingNewSessionForm
          blocked={Boolean(openSession)}
          onCreate={handleCreateSession}
          onClose={() => setNewSessionOpen(false)}
        />
      )}

      <>
          <div role="tablist" aria-label="Разделы матчинга" style={{ display: 'flex', gap: 22, flexWrap: 'wrap', margin: '18px 0 16px' }}>
            {MATCHING_SUB_TABS.map((tab, index) => {
              const active = tab.id === subTab
              const count = tabCounts[tab.id]
              return (
                <button
                  key={tab.id}
                  id={`admin-matching-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`admin-matching-panel-${tab.id}`}
                  aria-busy={count === null}
                  tabIndex={active ? 0 : -1}
                  onClick={() => selectSubTab(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className={`border-b-2 ${active ? 'border-text text-text' : 'border-transparent text-text-muted hover:text-text-body'} ${focusRing}`}
                  style={{ padding: '0 0 6px', fontFamily: 'var(--nd-sans)', fontSize: '0.82rem', cursor: 'pointer' }}
                  data-testid={`admin-matching-tab-${tab.id}`}
                >
                  {tab.label}
                  {count !== undefined && <span style={{ fontFamily: 'var(--nd-mono)', fontSize: '0.7rem', marginLeft: '0.35rem', color: 'var(--text-muted)' }}>{count ?? '…'}</span>}
                </button>
              )
            })}
          </div>

          <div
            role="tabpanel"
            id={`admin-matching-panel-${subTab}`}
            aria-labelledby={`admin-matching-tab-${subTab}`}
          >
            {subTab === 'instructions' && <AdminMatchingInstructions />}
            {subTab === 'demand' && selectedSession && (
              <AdminMatchingBookDemand
                books={coordination?.books ?? null}
                loading={coordinationLoading}
                error={coordinationError}
              />
            )}
            {subTab === 'people' && selectedSession && (
              <AdminMatchingParticipantsTab
                participants={participants}
                onlinePublicRefs={onlinePublicRefs}
                allUsers={allUsers}
                loading={participantsLoading}
                canMutate={isSelectedOpen}
                adding={addingParticipant}
                removingUserId={removingUserId}
                onAdd={handleAddParticipant}
                onRemove={handleRemoveParticipant}
                onRefresh={() => { loadParticipants(selectedSession.id); loadCoordination(selectedSession.id) }}
              />
            )}
            {subTab === 'log' && selectedSession && (
              <AdminMatchingLogTab
                key={selectedSession.id}
                events={events}
                loading={eventsLoading}
                isSessionOpen={isSelectedOpen}
                onRefresh={() => loadEvents(selectedSession.id)}
              />
            )}
          </div>
      </>
    </div>
  )
}
