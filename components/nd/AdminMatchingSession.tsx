'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  formatMatchingEvent,
  matchingEventTypeLabel,
  matchingSourceLabel,
  formatMatchingActor,
  formatMatchingSubject,
  type MatchingEventLike,
} from '@/lib/matching/matching-event-display'

interface MatchingSession {
  id: string
  name: string
  status: string
  deadlineAt: string | null
  createdAt: string
  stateVersion: number
}

interface MatchingEvent extends MatchingEventLike {
  id: string
  sessionId: string
  stateVersion: number
  occurredAt: string
}

interface Participant {
  userId: string
  publicRef: string
  joinSource: 'self' | 'admin'
  joinedAt: string
  name: string | null
  role: 'active' | 'observer'
}

interface AllUser {
  id: string
  name: string | null
}

const fieldInput: React.CSSProperties = {
  fontFamily: 'var(--nd-mono), monospace',
  fontSize: '0.8rem',
  border: 'none',
  borderBottom: '1px solid var(--border)',
  outline: 'none',
  padding: '2px 0',
  background: 'transparent',
  width: '100%',
}

const btn: React.CSSProperties = {
  fontFamily: 'var(--nd-mono), monospace',
  fontSize: '0.75rem',
  border: '1px solid var(--border)',
  background: 'none',
  padding: '4px 10px',
  cursor: 'pointer',
  borderRadius: 'var(--radius)',
}

const microLabel: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  textTransform: 'uppercase',
  letterSpacing: '0.13em',
  fontSize: '0.6rem',
  color: 'var(--text-muted)',
}

function statusRu(status: string): string {
  if (status === 'open') return 'Открыта'
  if (status === 'closed') return 'Закрыта'
  return status
}

// How many events to reveal per "show more" click.
const EVENTS_PAGE_SIZE = 10

const EMPTY_FILTERS = { day: '', eventType: '', source: '', actor: '', subject: '' }
type EventFilters = typeof EMPTY_FILTERS

function eventDay(event: MatchingEvent): string {
  return new Date(event.occurredAt).toLocaleDateString('ru-RU')
}

const filterSelectStyle: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.72rem',
  border: '1px solid var(--border)',
  borderBottom: '2px solid var(--border-strong)',
  borderRadius: 'var(--radius)',
  background: 'var(--bg-input)',
  color: 'var(--text-body)',
  padding: '3px 6px',
  maxWidth: 180,
}

// ——— Main component ———

export default function AdminMatchingSession() {
  const [sessions, setSessions] = useState<MatchingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [matchingEventsList, setMatchingEventsList] = useState<MatchingEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventFilters, setEventFilters] = useState<EventFilters>(EMPTY_FILTERS)
  const [visibleEventsCount, setVisibleEventsCount] = useState(EVENTS_PAGE_SIZE)

  const [participants, setParticipants] = useState<Participant[]>([])
  const [onlinePublicRefs, setOnlinePublicRefs] = useState<Set<string>>(new Set())
  const [allUsers, setAllUsers] = useState<AllUser[]>([])
  const [participantsLoading, setParticipantsLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [addingParticipant, setAddingParticipant] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [deadlineAt, setDeadlineAt] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const load = useCallback(async () => {
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

  useEffect(() => { load() }, [load])

  const loadEvents = useCallback(async (sessionId: string) => {
    setEventsLoading(true)
    try {
      const res = await fetch(`/api/admin/matching/preference-events?sessionId=${encodeURIComponent(sessionId)}&limit=100`)
      const json = await res.json()
      if (res.ok) setMatchingEventsList(json.events ?? [])
    } finally {
      setEventsLoading(false)
    }
  }, [])

  const loadParticipants = useCallback(async (sessionId: string) => {
    setParticipantsLoading(true)
    try {
      const res = await fetch(`/api/admin/matching/sessions/${sessionId}/participants`)
      const json = await res.json()
      if (res.ok) {
        setParticipants(json.data ?? [])
        // Online list contains publicRefs; store as-is for best-effort display.
        setOnlinePublicRefs(new Set<string>(json.online ?? []))
      }
    } finally {
      setParticipantsLoading(false)
    }
  }, [])

  const loadAllUsers = useCallback(async () => {
    const res = await fetch('/api/admin/users')
    const json = await res.json()
    if (res.ok) setAllUsers(json.data ?? [])
  }, [])

  // Default selection: current writable session, otherwise the most recent one.
  useEffect(() => {
    if (sessions.length === 0) return
    setSelectedSessionId(prev => {
      if (prev && sessions.some(s => s.id === prev)) return prev
      return (sessions.find(s => s.status === 'open') ?? sessions[0]).id
    })
  }, [sessions])

  // Load data for the selected session.
  useEffect(() => {
    if (!selectedSessionId) return
    loadEvents(selectedSessionId)
    loadParticipants(selectedSessionId)
    loadAllUsers()
    setEventFilters(EMPTY_FILTERS)
    setVisibleEventsCount(EVENTS_PAGE_SIZE)
  }, [selectedSessionId, loadEvents, loadParticipants, loadAllUsers])

  // Distinct values for each filterable column, derived from the loaded events.
  const eventFilterOptions = useMemo(() => {
    const days = new Set<string>()
    const eventTypes = new Set<string>()
    const sources = new Set<string>()
    const actors = new Set<string>()
    const subjects = new Set<string>()
    for (const ev of matchingEventsList) {
      days.add(eventDay(ev))
      eventTypes.add(ev.eventType)
      sources.add(ev.source)
      actors.add(formatMatchingActor(ev))
      subjects.add(formatMatchingSubject(ev))
    }
    return {
      days: Array.from(days),
      eventTypes: Array.from(eventTypes),
      sources: Array.from(sources),
      actors: Array.from(actors).sort((a, b) => a.localeCompare(b, 'ru')),
      subjects: Array.from(subjects).sort((a, b) => a.localeCompare(b, 'ru')),
    }
  }, [matchingEventsList])

  const filteredEvents = useMemo(() => matchingEventsList.filter(ev => (
    (!eventFilters.day || eventDay(ev) === eventFilters.day) &&
    (!eventFilters.eventType || ev.eventType === eventFilters.eventType) &&
    (!eventFilters.source || ev.source === eventFilters.source) &&
    (!eventFilters.actor || formatMatchingActor(ev) === eventFilters.actor) &&
    (!eventFilters.subject || formatMatchingSubject(ev) === eventFilters.subject)
  )), [matchingEventsList, eventFilters])

  const updateEventFilter = useCallback((key: keyof EventFilters, value: string) => {
    setEventFilters(prev => ({ ...prev, [key]: value }))
    setVisibleEventsCount(EVENTS_PAGE_SIZE)
  }, [])

  const selectedSession = sessions.find(s => s.id === selectedSessionId) ?? null
  const openSession = sessions.find(s => s.status === 'open')
  const isSelectedOpen = selectedSession?.status === 'open'
  const isSelectedClosed = selectedSession?.status === 'closed'
  const canAdminMutateParticipants = Boolean(selectedSession && isSelectedOpen)
  const [freezing, setFreezing] = useState(false)
  const [freezeError, setFreezeError] = useState<string | null>(null)

  async function handleAddParticipant() {
    if (!selectedSession || !canAdminMutateParticipants || !selectedUserId) return
    setAddingParticipant(true)
    try {
      const res = await fetch(`/api/admin/matching/sessions/${selectedSession.id}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId }),
      })
      if (res.ok) {
        setSelectedUserId('')
        await loadParticipants(selectedSession.id)
      }
    } finally {
      setAddingParticipant(false)
    }
  }

  async function handleRemoveParticipant(userId: string) {
    if (!selectedSession || !canAdminMutateParticipants) return
    setRemovingUserId(userId)
    try {
      const res = await fetch(
        `/api/admin/matching/sessions/${selectedSession.id}/participants/${userId}`,
        { method: 'DELETE' },
      )
      if (res.ok) {
        await loadParticipants(selectedSession.id)
      }
    } finally {
      setRemovingUserId(null)
    }
  }

  async function handleBookModeLifecycle(action: 'closeSession' | 'reopenSession') {
    if (!selectedSession) return
    const label = action === 'closeSession' ? 'Закрыть' : 'Снова открыть'
    if (!window.confirm(`${label} сессию «${selectedSession.name}»?`)) return
    setFreezing(true)
    setFreezeError(null)
    try {
      const res = await fetch(`/api/admin/matching/sessions/${selectedSession.id}/book-admin-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, expectedStateVersion: selectedSession.stateVersion }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Не удалось изменить состояние сессии')
      await load()
    } catch (e) {
      setFreezeError(e instanceof Error ? e.message : 'Неизвестная ошибка')
    } finally {
      setFreezing(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/matching/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          deadlineAt: deadlineAt || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Ошибка создания')
      setName('')
      setDeadlineAt('')
      await load()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Неизвестная ошибка')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ fontFamily: 'var(--nd-mono), monospace', fontSize: '0.82rem', padding: '1.2rem 0' }}>
      <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem' }}>
        Matching-сессия
      </h3>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>}
      {error && <p style={{ color: 'var(--accent)' }}>{error}</p>}

      {/* Session switcher */}
      {!loading && sessions.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ ...microLabel, marginBottom: '0.5rem' }}>Сессии</div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {sessions.map(s => {
              const active = s.id === selectedSessionId
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSessionId(s.id)}
                  data-testid="matching-session-chip"
                  style={{
                    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                    fontSize: '0.74rem',
                    cursor: 'pointer',
                    padding: '0.3rem 0.6rem',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    background: active ? 'var(--text)' : 'var(--bg-input)',
                    color: active ? 'var(--bg-input)' : 'var(--text-body)',
                    borderBottom: s.status === 'open'
                      ? '2px solid var(--success)'
                      : '2px solid var(--border-strong)',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '0.4rem',
                  }}
                >
                  <span>{s.name}</span>
                  <span style={{
                    fontSize: '0.58rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    opacity: 0.7,
                  }}>
                    {statusRu(s.status)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Selected session detail */}
      {!loading && selectedSession && (
        <div
          style={{
            marginBottom: '1.5rem',
            padding: '0.9rem',
            border: '1px solid var(--border-strong)',
            borderLeft: isSelectedOpen ? '2px solid var(--success)' : '2px solid var(--accent)',
            borderRadius: 'var(--radius)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--nd-serif), Georgia, serif', fontSize: '1.05rem', color: 'var(--text)' }}>
              {selectedSession.name}
            </div>
            <span style={{
              ...microLabel,
              color: isSelectedOpen ? 'var(--success)' : 'var(--accent)',
              borderBottom: '1px solid currentColor',
            }}>
              {statusRu(selectedSession.status)}
            </span>
          </div>

          <div style={{ marginTop: '0.6rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', color: 'var(--text-body)' }}>
            <span>Создана: {new Date(selectedSession.createdAt).toLocaleDateString('ru-RU')}</span>
            {selectedSession.deadlineAt && (
              <span>Дедлайн: {new Date(selectedSession.deadlineAt).toLocaleString('ru-RU')}</span>
            )}
          </div>

          {isSelectedOpen && (
            <div style={{ marginTop: '0.8rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <a
                href="/matching"
                style={{ color: 'var(--text-body)', textDecoration: 'underline', fontSize: '0.78rem' }}
              >
                Открыть страницу матчинга →
              </a>
              <button
                  onClick={() => handleBookModeLifecycle('closeSession')}
                  disabled={freezing}
                  style={{ ...btn, borderColor: 'var(--accent)', color: 'var(--accent)' }}
                  data-testid="admin-close-session"
                >
                  {freezing ? 'Закрываю…' : 'Закрыть сессию'}
                </button>
            </div>
          )}
          {isSelectedClosed && (
            <div style={{ marginTop: '0.8rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Участники не могут менять выбор; административная корректировка остаётся доступной.</span>
              <button
                onClick={() => handleBookModeLifecycle('reopenSession')}
                disabled={freezing}
                style={{ ...btn, borderColor: 'var(--success)', color: 'var(--success)' }}
                data-testid="admin-reopen-session"
              >
                {freezing ? 'Открываю…' : 'Открыть снова'}
              </button>
            </div>
          )}
          {freezeError && <p style={{ color: 'var(--accent)', fontSize: '0.75rem', marginTop: 4 }}>{freezeError}</p>}
        </div>
      )}

      {/* Participants table */}
      {!loading && selectedSession && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ ...microLabel, marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            Участники ({participants.length})
            <button
              onClick={() => loadParticipants(selectedSession.id)}
              style={{ ...btn, fontSize: '0.7rem', padding: '2px 6px' }}
            >
              ↺
            </button>
          </div>

          {participantsLoading && <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Загрузка…</p>}

          {!participantsLoading && participants.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Нет участников.</p>
          )}

          {!participantsLoading && participants.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', marginBottom: '0.75rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '3px 8px 3px 0' }}>Имя</th>
                  <th style={{ padding: '3px 8px' }}>Источник</th>
                  <th style={{ padding: '3px 8px' }}>Роль</th>
                  <th style={{ padding: '3px 8px' }}>Вступил</th>
                  {canAdminMutateParticipants && <th style={{ padding: '3px 8px' }}></th>}
                </tr>
              </thead>
              <tbody>
                {participants.map(p => {
                  const isObserver = p.role === 'observer'
                  const isOnline = onlinePublicRefs.has(p.publicRef)
                  return (
                    <tr key={p.userId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '3px 8px 3px 0', fontWeight: 500 }}>
                        {isOnline && (
                          <span
                            data-testid="admin-participant-online-dot"
                            title="онлайн"
                            style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', marginRight: '0.4rem', verticalAlign: 'middle' }}
                          />
                        )}
                        <a
                          href={`/matching?as=${p.userId}`}
                          style={{ color: 'var(--text-body)', textDecoration: 'underline' }}
                          title={p.userId}
                        >
                          {p.name ?? p.userId.slice(0, 12) + '…'}
                        </a>
                      </td>
                      <td style={{ padding: '3px 8px', color: 'var(--text-secondary)' }}>
                        <span style={{
                          ...microLabel,
                          color: p.joinSource === 'admin' ? 'var(--accent)' : 'var(--text-muted)',
                        }}>
                          {p.joinSource === 'admin' ? 'Admininstrator' : 'Сам'}
                        </span>
                      </td>
                      <td style={{ padding: '3px 8px' }}>
                        <span style={{
                          ...microLabel,
                          color: isObserver ? 'var(--text-muted)' : 'var(--success)',
                        }}>
                          {isObserver ? 'наблюдатель' : 'активный'}
                        </span>
                      </td>
                      <td style={{ padding: '3px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(p.joinedAt).toLocaleString('ru-RU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      {canAdminMutateParticipants && (
                        <td style={{ padding: '3px 8px' }}>
                          <button
                            onClick={() => handleRemoveParticipant(p.userId)}
                            disabled={removingUserId === p.userId}
                            style={{ ...btn, fontSize: '0.7rem', padding: '1px 6px', color: 'var(--accent)', borderColor: 'var(--accent)' }}
                          >
                            {removingUserId === p.userId ? '…' : 'Убрать'}
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* Admin add control */}
          {canAdminMutateParticipants && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <p
                data-testid="admin-add-disclosure-warning"
                style={{ fontSize: '0.72rem', color: 'var(--accent)', margin: 0 }}
              >
                ⚠ Добавление через админку обходит раскрытие реального имени участником. Используйте только в обоснованных случаях.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <select
                  value={selectedUserId}
                  onChange={e => setSelectedUserId(e.target.value)}
                  style={{ ...fieldInput, width: 'auto', minWidth: 160, border: '1px solid var(--border)', padding: '4px 6px', borderRadius: 'var(--radius)' }}
                >
                  <option value="">— выбрать пользователя —</option>
                  {allUsers
                    .filter(u => !participants.some(p => p.userId === u.id))
                    .map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name ?? u.id.slice(0, 12) + '…'}
                      </option>
                    ))}
                </select>
                <button
                  onClick={handleAddParticipant}
                  disabled={!selectedUserId || addingParticipant}
                  style={{ ...btn, opacity: !selectedUserId || addingParticipant ? 0.5 : 1 }}
                >
                  {addingParticipant ? 'Добавляю…' : 'Добавить'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Сессий пока нет.</p>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.6rem' }}>
          Создать новую сессию
        </div>
        {openSession && (
          <p style={{ color: 'var(--status-warn)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
            ⚠ Уже есть открытая сессия. Сначала закройте её, затем создайте новую.
          </p>
        )}
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxWidth: 400 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
              Название *
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Например: Июньская встреча"
              required
              disabled={creating || !!openSession}
              style={fieldInput}
              data-testid="matching-session-name"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
              Дедлайн (опционально)
            </label>
            <input
              type="datetime-local"
              value={deadlineAt}
              onChange={e => setDeadlineAt(e.target.value)}
              disabled={creating || !!openSession}
              style={fieldInput}
              data-testid="matching-session-deadline"
            />
          </div>
          {createError && <p style={{ color: 'var(--accent)', fontSize: '0.75rem' }}>{createError}</p>}
          <button
            type="submit"
            disabled={creating || !name.trim() || !!openSession}
            style={{ ...btn, alignSelf: 'flex-start' }}
            data-testid="matching-session-submit"
          >
            {creating ? 'Создаю…' : 'Создать сессию'}
          </button>
        </form>
      </div>

      {/* Analytics section — reads from matching_events */}
      {selectedSession && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ ...microLabel, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            Аналитика изменений предпочтений
            <button onClick={() => loadEvents(selectedSession.id)} style={{ ...btn, fontSize: '0.7rem', padding: '2px 6px' }}>
              ↺
            </button>
          </div>
          {eventsLoading && <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Загрузка…</p>}
          {!eventsLoading && matchingEventsList.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              {isSelectedOpen
                ? 'После входа в сессию участники ещё не меняли предпочтения.'
                : 'В этой сессии не было изменений предпочтений.'}
            </p>
          )}
          {!eventsLoading && matchingEventsList.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
                {Object.entries(countEvents(matchingEventsList)).map(([type, count]) => (
                  <span
                    key={type}
                    style={{
                      border: '1px solid var(--border)',
                      borderBottom: '2px solid var(--border-strong)',
                      padding: '0.25rem 0.45rem',
                      fontSize: '0.7rem',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {matchingEventTypeLabel(type)}: {count}
                  </span>
                ))}
              </div>

              {/* Per-column filters */}
              <div
                data-testid="admin-matching-preference-filters"
                style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.7rem', alignItems: 'center' }}
              >
                <select
                  aria-label="Фильтр по дате"
                  value={eventFilters.day}
                  onChange={e => updateEventFilter('day', e.target.value)}
                  style={filterSelectStyle}
                >
                  <option value="">Когда: все</option>
                  {eventFilterOptions.days.map(day => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
                <select
                  aria-label="Фильтр по событию"
                  value={eventFilters.eventType}
                  onChange={e => updateEventFilter('eventType', e.target.value)}
                  style={filterSelectStyle}
                >
                  <option value="">Событие: все</option>
                  {eventFilterOptions.eventTypes.map(type => (
                    <option key={type} value={type}>{matchingEventTypeLabel(type)}</option>
                  ))}
                </select>
                <select
                  aria-label="Фильтр по источнику"
                  value={eventFilters.source}
                  onChange={e => updateEventFilter('source', e.target.value)}
                  style={filterSelectStyle}
                >
                  <option value="">Источник: все</option>
                  {eventFilterOptions.sources.map(src => (
                    <option key={src} value={src}>{matchingSourceLabel(src)}</option>
                  ))}
                </select>
                <select
                  aria-label="Фильтр по актору"
                  value={eventFilters.actor}
                  onChange={e => updateEventFilter('actor', e.target.value)}
                  style={filterSelectStyle}
                >
                  <option value="">Актор: все</option>
                  {eventFilterOptions.actors.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
                <select
                  aria-label="Фильтр по участнику"
                  value={eventFilters.subject}
                  onChange={e => updateEventFilter('subject', e.target.value)}
                  style={filterSelectStyle}
                >
                  <option value="">Участник: все</option>
                  {eventFilterOptions.subjects.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {(eventFilters.day || eventFilters.eventType || eventFilters.source || eventFilters.actor || eventFilters.subject) && (
                  <button
                    onClick={() => { setEventFilters(EMPTY_FILTERS); setVisibleEventsCount(EVENTS_PAGE_SIZE) }}
                    style={{ ...btn, fontSize: '0.7rem', padding: '3px 8px' }}
                  >
                    Сбросить
                  </button>
                )}
              </div>

              {filteredEvents.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Под фильтры ничего не подходит.</p>
              ) : (
                <>
                  <table
                    data-testid="admin-matching-preference-events"
                    style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}
                  >
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '3px 8px 3px 0' }}>Когда</th>
                        <th style={{ padding: '3px 8px' }}>Событие</th>
                        <th style={{ padding: '3px 8px' }}>Источник</th>
                        <th style={{ padding: '3px 8px' }}>Актор</th>
                        <th style={{ padding: '3px 8px' }}>Участник</th>
                        <th style={{ padding: '3px 8px' }}>Деталь</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEvents.slice(0, visibleEventsCount).map(ev => (
                        <tr key={ev.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '3px 8px 3px 0', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {new Date(ev.occurredAt).toLocaleString('ru-RU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '3px 8px', color: 'var(--text-body)' }}>{matchingEventTypeLabel(ev.eventType)}</td>
                          <td style={{ padding: '3px 8px', color: 'var(--text-secondary)' }}>{matchingSourceLabel(ev.source)}</td>
                          <td style={{ padding: '3px 8px', color: 'var(--text-secondary)' }}>{formatMatchingActor(ev)}</td>
                          <td style={{ padding: '3px 8px', color: 'var(--text-secondary)' }}>{formatMatchingSubject(ev)}</td>
                          <td style={{ padding: '3px 8px', color: 'var(--text-muted)' }}>{formatMatchingEvent(ev)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.6rem' }}>
                    <span style={{ ...microLabel }}>
                      Показано {Math.min(visibleEventsCount, filteredEvents.length)} из {filteredEvents.length}
                    </span>
                    {visibleEventsCount < filteredEvents.length && (
                      <button
                        onClick={() => setVisibleEventsCount(c => c + EVENTS_PAGE_SIZE)}
                        data-testid="admin-matching-preference-show-more"
                        style={{ ...btn, fontSize: '0.72rem' }}
                      >
                        Показать ещё {Math.min(EVENTS_PAGE_SIZE, filteredEvents.length - visibleEventsCount)}
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

    </div>
  )
}

function countEvents(events: MatchingEvent[]): Record<string, number> {
  return events.reduce<Record<string, number>>((acc, ev) => {
    acc[ev.eventType] = (acc[ev.eventType] ?? 0) + 1
    return acc
  }, {})
}
