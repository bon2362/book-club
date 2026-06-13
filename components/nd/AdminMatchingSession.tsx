'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  type PreferenceEventMetadata,
  eventDetail,
  eventTypeLabel,
  formatParticipant,
  sourceLabel,
} from '@/lib/matching/preference-event-display'

interface MatchingSession {
  id: string
  name: string
  status: string
  minGroupSize: number
  maxGroupSize: number
  deadlineAt: string | null
  createdAt: string
  frozenAt: string | null
  metricGroupsCount?: number | null
  metricCoverage?: number | null
  metricTop3HitRate?: number | null
  optimizationMode?: 'coverage' | 'satisfaction'
}

interface PreferenceEvent {
  id: string
  sessionId: string
  userId: string
  actorUserId: string
  userName: string | null
  actorName: string | null
  userPseudonym: string | null
  actorPseudonym: string | null
  eventType: string
  source: string
  bookId: string | null
  metadata: PreferenceEventMetadata | null
  occurredAt: string
}

interface Participant {
  userId: string
  pseudonym: string
  joinedAt: string
  name: string | null
}

interface AllUser {
  id: string
  name: string | null
}

type OptimizationMode = 'coverage' | 'satisfaction'

const matchingModes: {
  id: OptimizationMode
  name: string
  tag: string
  description: string
  accent: string
}[] = [
  {
    id: 'coverage',
    name: 'Покрытие',
    tag: 'по умолчанию',
    description: 'Собрать в группы как можно больше участников. Сценарии ранжируются по охвату — текущее поведение.',
    accent: 'var(--success)',
  },
  {
    id: 'satisfaction',
    name: 'Удовлетворённость',
    tag: 'новый',
    description: 'Сначала качество совпадений: лучшие круги по интересам, даже если кто-то останется без группы.',
    accent: 'var(--accent)',
  },
]

const satisfactionModeNotes = [
  'Перед доской участник проходит экран ранжирования.',
  'Без ранга участник не попадает в подбор.',
  'Админ может переключить режим на странице /matching, когда все участники расставили приоритеты.',
]

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
  if (status === 'active') return 'Активная'
  if (status === 'frozen') return 'Зафиксирована'
  return status
}

// How many preference events to reveal per "show more" click.
const PREFERENCE_EVENTS_PAGE_SIZE = 10

const EMPTY_FILTERS = { day: '', eventType: '', source: '', participant: '', actor: '' }
type PreferenceEventFilters = typeof EMPTY_FILTERS

function eventDay(event: PreferenceEvent): string {
  return new Date(event.occurredAt).toLocaleDateString('ru-RU')
}

function participantLabel(event: PreferenceEvent): string {
  return formatParticipant({
    name: event.userName,
    pseudonym: event.userPseudonym ?? event.metadata?.pseudonym,
    userId: event.userId,
  })
}

function actorLabel(event: PreferenceEvent): string {
  return formatParticipant({ name: event.actorName, pseudonym: event.actorPseudonym, userId: event.actorUserId })
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

export default function AdminMatchingSession() {
  const [sessions, setSessions] = useState<MatchingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [preferenceEvents, setPreferenceEvents] = useState<PreferenceEvent[]>([])
  const [preferenceEventsLoading, setPreferenceEventsLoading] = useState(false)
  const [eventFilters, setEventFilters] = useState<PreferenceEventFilters>(EMPTY_FILTERS)
  const [visibleEventsCount, setVisibleEventsCount] = useState(PREFERENCE_EVENTS_PAGE_SIZE)

  const [participants, setParticipants] = useState<Participant[]>([])
  const [onlinePseudonyms, setOnlinePseudonyms] = useState<Set<string>>(new Set())
  const [allUsers, setAllUsers] = useState<AllUser[]>([])
  const [participantsLoading, setParticipantsLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [addingParticipant, setAddingParticipant] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [minGroupSize, setMinGroupSize] = useState(3)
  const [maxGroupSize, setMaxGroupSize] = useState(3)
  const [deadlineAt, setDeadlineAt] = useState('')
  const [optimizationMode, setOptimizationMode] = useState<OptimizationMode>('coverage')
  const [focusedOptimizationMode, setFocusedOptimizationMode] = useState<OptimizationMode | null>(null)
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

  const loadPreferenceEvents = useCallback(async (sessionId: string) => {
    setPreferenceEventsLoading(true)
    try {
      const res = await fetch(`/api/admin/matching/preference-events?sessionId=${encodeURIComponent(sessionId)}&limit=100`)
      const json = await res.json()
      if (res.ok) setPreferenceEvents(json.events ?? [])
    } finally {
      setPreferenceEventsLoading(false)
    }
  }, [])

  const loadParticipants = useCallback(async (sessionId: string) => {
    setParticipantsLoading(true)
    try {
      const res = await fetch(`/api/admin/matching/sessions/${sessionId}/participants`)
      const json = await res.json()
      if (res.ok) {
        setParticipants(json.data ?? [])
        setOnlinePseudonyms(new Set<string>(json.online ?? []))
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

  // Default selection: active session, otherwise the most recent one.
  useEffect(() => {
    if (sessions.length === 0) return
    setSelectedSessionId(prev => {
      if (prev && sessions.some(s => s.id === prev)) return prev
      return (sessions.find(s => s.status === 'active') ?? sessions[0]).id
    })
  }, [sessions])

  // Load data for whichever session is selected (active or frozen).
  useEffect(() => {
    if (!selectedSessionId) return
    loadPreferenceEvents(selectedSessionId)
    loadParticipants(selectedSessionId)
    loadAllUsers()
    setEventFilters(EMPTY_FILTERS)
    setVisibleEventsCount(PREFERENCE_EVENTS_PAGE_SIZE)
  }, [selectedSessionId, loadPreferenceEvents, loadParticipants, loadAllUsers])

  // Distinct values for each filterable column, derived from the loaded events.
  const eventFilterOptions = useMemo(() => {
    const days = new Set<string>()
    const eventTypes = new Set<string>()
    const sources = new Set<string>()
    const participants = new Set<string>()
    const actors = new Set<string>()
    for (const event of preferenceEvents) {
      days.add(eventDay(event))
      eventTypes.add(event.eventType)
      sources.add(event.source)
      participants.add(participantLabel(event))
      actors.add(actorLabel(event))
    }
    return {
      days: Array.from(days),
      eventTypes: Array.from(eventTypes),
      sources: Array.from(sources),
      participants: Array.from(participants).sort((a, b) => a.localeCompare(b, 'ru')),
      actors: Array.from(actors).sort((a, b) => a.localeCompare(b, 'ru')),
    }
  }, [preferenceEvents])

  const filteredEvents = useMemo(() => preferenceEvents.filter(event => (
    (!eventFilters.day || eventDay(event) === eventFilters.day) &&
    (!eventFilters.eventType || event.eventType === eventFilters.eventType) &&
    (!eventFilters.source || event.source === eventFilters.source) &&
    (!eventFilters.participant || participantLabel(event) === eventFilters.participant) &&
    (!eventFilters.actor || actorLabel(event) === eventFilters.actor)
  )), [preferenceEvents, eventFilters])

  const updateEventFilter = useCallback((key: keyof PreferenceEventFilters, value: string) => {
    setEventFilters(prev => ({ ...prev, [key]: value }))
    setVisibleEventsCount(PREFERENCE_EVENTS_PAGE_SIZE)
  }, [])

  const activeSession = sessions.find(s => s.status === 'active')
  const selectedSession = sessions.find(s => s.id === selectedSessionId) ?? null
  const isSelectedActive = selectedSession?.status === 'active'
  const [freezing, setFreezing] = useState(false)
  const [freezeError, setFreezeError] = useState<string | null>(null)

  async function handleAddParticipant() {
    if (!selectedSession || selectedSession.status !== 'active' || !selectedUserId) return
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
    if (!selectedSession || selectedSession.status !== 'active') return
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

  async function handleFreeze() {
    if (!activeSession) return
    if (!window.confirm(`Зафиксировать сессию «${activeSession.name}»? Это действие необратимо.`)) return
    setFreezing(true)
    setFreezeError(null)
    try {
      const res = await fetch(`/api/matching/sessions/${activeSession.id}/freeze`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Ошибка заморозки')
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
          minGroupSize,
          maxGroupSize,
          deadlineAt: deadlineAt || null,
          optimizationMode,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Ошибка создания')
      setName('')
      setDeadlineAt('')
      setMinGroupSize(3)
      setMaxGroupSize(3)
      setOptimizationMode('coverage')
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

      <Link
        href="/admin/gallery"
        data-testid="admin-gallery-link"
        style={{
          display: 'inline-block',
          marginBottom: '1rem',
          padding: '0.35rem 0.7rem',
          border: '1px solid var(--border-strong)',
          color: 'var(--text)',
          textDecoration: 'none',
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        🖼 Галерея фото видов
      </Link>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>}
      {error && <p style={{ color: 'var(--accent)' }}>{error}</p>}

      {/* Session switcher — pick any session (active or frozen) to inspect */}
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
                    borderBottom: s.status === 'active'
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
            borderLeft: isSelectedActive ? '2px solid var(--success)' : '2px solid var(--accent)',
            borderRadius: 'var(--radius)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--nd-serif), Georgia, serif', fontSize: '1.05rem', color: 'var(--text)' }}>
              {selectedSession.name}
            </div>
            <span style={{
              ...microLabel,
              color: isSelectedActive ? 'var(--success)' : 'var(--accent)',
              borderBottom: '1px solid currentColor',
            }}>
              {statusRu(selectedSession.status)}
            </span>
          </div>

          <div style={{ marginTop: '0.6rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', color: 'var(--text-body)' }}>
            <span>
              Размер: {selectedSession.minGroupSize === selectedSession.maxGroupSize
                ? selectedSession.minGroupSize
                : `${selectedSession.minGroupSize}–${selectedSession.maxGroupSize}`}
            </span>
            <span>Создана: {new Date(selectedSession.createdAt).toLocaleDateString('ru-RU')}</span>
            {selectedSession.deadlineAt && (
              <span>Дедлайн: {new Date(selectedSession.deadlineAt).toLocaleString('ru-RU')}</span>
            )}
            {selectedSession.frozenAt && (
              <span>Зафиксирована: {new Date(selectedSession.frozenAt).toLocaleDateString('ru-RU')}</span>
            )}
          </div>

          {/* Freeze metrics for frozen sessions */}
          {!isSelectedActive && (
            selectedSession.metricGroupsCount != null ||
            selectedSession.metricCoverage != null ||
            selectedSession.metricTop3HitRate != null
          ) && (
            <div style={{ marginTop: '0.7rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              {selectedSession.metricGroupsCount != null && (
                <div>
                  <div style={microLabel}>Групп</div>
                  <div style={{ fontFamily: 'var(--nd-serif), Georgia, serif', fontSize: '1.1rem' }}>{selectedSession.metricGroupsCount}</div>
                </div>
              )}
              {selectedSession.metricCoverage != null && (
                <div>
                  <div style={microLabel}>Охват</div>
                  <div style={{ fontFamily: 'var(--nd-serif), Georgia, serif', fontSize: '1.1rem' }}>{selectedSession.metricCoverage}</div>
                </div>
              )}
              {selectedSession.metricTop3HitRate != null && (
                <div>
                  <div style={microLabel}>Топ-3 попадание</div>
                  <div style={{ fontFamily: 'var(--nd-serif), Georgia, serif', fontSize: '1.1rem' }}>
                    {Math.round(selectedSession.metricTop3HitRate * 100)}%
                  </div>
                </div>
              )}
            </div>
          )}

          {isSelectedActive && (
            <div style={{ marginTop: '0.8rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <a
                href="/matching"
                style={{ color: 'var(--text-body)', textDecoration: 'underline', fontSize: '0.78rem' }}
              >
                Открыть страницу матчинга →
              </a>
              <button
                onClick={handleFreeze}
                disabled={freezing}
                style={{ ...btn, borderColor: 'var(--accent)', color: 'var(--accent)' }}
                data-testid="admin-freeze-session"
              >
                {freezing ? 'Фиксирую…' : 'Зафиксировать'}
              </button>
            </div>
          )}
          {!isSelectedActive && (
            <p style={{ ...microLabel, marginTop: '0.7rem' }}>
              Сессия зафиксирована — данные доступны только для просмотра
            </p>
          )}
          {freezeError && <p style={{ color: 'var(--accent)', fontSize: '0.75rem', marginTop: 4 }}>{freezeError}</p>}
        </div>
      )}

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
                  <th style={{ padding: '3px 8px 3px 0' }}>Псевдоним</th>
                  <th style={{ padding: '3px 8px' }}>Пользователь</th>
                  <th style={{ padding: '3px 8px' }}>Вступил</th>
                  {isSelectedActive && <th style={{ padding: '3px 8px' }}></th>}
                </tr>
              </thead>
              <tbody>
                {participants.map(p => (
                  <tr key={p.userId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '3px 8px 3px 0', fontWeight: 500 }}>
                      {onlinePseudonyms.has(p.pseudonym) && (
                        <span
                          data-testid="admin-participant-online-dot"
                          title="онлайн"
                          style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', marginRight: '0.4rem', verticalAlign: 'middle' }}
                        />
                      )}
                      {p.pseudonym}
                    </td>
                    <td style={{ padding: '3px 8px', color: 'var(--text-secondary)' }}>
                      <a
                        href={`/matching?as=${p.userId}`}
                        style={{ color: 'var(--text-body)', textDecoration: 'underline' }}
                        title={p.userId}
                      >
                        {p.name ?? p.userId.slice(0, 12) + '…'}
                      </a>
                    </td>
                    <td style={{ padding: '3px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(p.joinedAt).toLocaleString('ru-RU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    {isSelectedActive && (
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
                ))}
              </tbody>
            </table>
          )}

          {isSelectedActive && (
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
          )}
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Сессий пока нет.</p>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.6rem' }}>
          {activeSession ? 'Создать новую сессию (заменит активную после её заморозки)' : 'Создать новую сессию'}
        </div>
        {activeSession && (
          <p style={{ color: 'var(--status-warn)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
            ⚠ Уже есть активная сессия. Сначала заморозьте её, затем создайте новую.
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
              disabled={creating || !!activeSession}
              style={fieldInput}
              data-testid="matching-session-name"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
              Размер группы
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>от</span>
              <input
                type="number"
                min={2}
                max={10}
                value={minGroupSize}
                onChange={e => {
                  const value = Number(e.target.value)
                  setMinGroupSize(value)
                  if (maxGroupSize < value) setMaxGroupSize(value)
                }}
                disabled={creating || !!activeSession}
                style={{ ...fieldInput, width: 60 }}
                data-testid="matching-session-min-group-size"
              />
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>до</span>
              <input
                type="number"
                min={minGroupSize}
                max={10}
                value={maxGroupSize}
                onChange={e => setMaxGroupSize(Number(e.target.value))}
                disabled={creating || !!activeSession}
                style={{ ...fieldInput, width: 60 }}
                data-testid="matching-session-max-group-size"
              />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
              Дедлайн (опционально)
            </label>
            <input
              type="datetime-local"
              value={deadlineAt}
              onChange={e => setDeadlineAt(e.target.value)}
              disabled={creating || !!activeSession}
              style={fieldInput}
              data-testid="matching-session-deadline"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
              Режим подбора
            </label>
            <div
              role="radiogroup"
              aria-label="Режим подбора"
              data-testid="matching-session-mode"
              style={{
                border: '1px solid var(--border)',
                borderBottom: '2px solid var(--border-strong)',
                borderRadius: 'var(--radius)',
                overflow: 'hidden',
                background: 'var(--bg-input)',
              }}
            >
              {matchingModes.map((modeOption, index) => {
                const selected = optimizationMode === modeOption.id
                const focused = focusedOptimizationMode === modeOption.id
                const disabled = creating || !!activeSession
                return (
                  <label
                    key={modeOption.id}
                    data-testid={`mode-option-${modeOption.id}`}
                    style={{
                      width: '100%',
                      display: 'flex',
                      gap: '0.6rem',
                      padding: '0.6rem 0.75rem',
                      textAlign: 'left',
                      border: 'none',
                      borderTop: index === 0 ? 'none' : '1px solid var(--border)',
                      borderLeft: selected || focused ? `2px solid ${modeOption.accent}` : '2px solid transparent',
                      outline: focused ? `1px solid ${modeOption.accent}` : 'none',
                      outlineOffset: -3,
                      background: selected ? 'var(--bg)' : 'var(--bg-input)',
                      color: 'var(--text)',
                      cursor: disabled ? 'default' : 'pointer',
                      opacity: disabled ? 0.55 : 1,
                      borderRadius: 'var(--radius)',
                      fontFamily: 'var(--nd-mono), monospace',
                      position: 'relative',
                    }}
                  >
                    <input
                      type="radio"
                      name="matching-session-optimization-mode"
                      value={modeOption.id}
                      checked={selected}
                      disabled={disabled}
                      onChange={() => setOptimizationMode(modeOption.id)}
                      onFocus={() => setFocusedOptimizationMode(modeOption.id)}
                      onBlur={() => setFocusedOptimizationMode(null)}
                      style={{
                        position: 'absolute',
                        opacity: 0,
                        pointerEvents: 'none',
                      }}
                    />
                    <span
                      aria-hidden
                      style={{
                        width: 13,
                        height: 13,
                        marginTop: 2,
                        border: `1.5px solid ${selected ? modeOption.accent : 'var(--text-muted)'}`,
                        borderRadius: 'var(--radius)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: '0 0 auto',
                      }}
                    >
                      {selected && (
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            background: modeOption.accent,
                            borderRadius: 'var(--radius)',
                          }}
                        />
                      )}
                    </span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                          {modeOption.name}
                        </span>
                        <span
                          style={{
                            fontSize: '0.56rem',
                            letterSpacing: '0.13em',
                            textTransform: 'uppercase',
                            color: selected ? modeOption.accent : 'var(--text-muted)',
                          }}
                        >
                          {modeOption.tag}
                        </span>
                      </span>
                      <span style={{ display: 'block', marginTop: '0.18rem', fontSize: '0.72rem', lineHeight: 1.45, color: 'var(--text-secondary)' }}>
                        {modeOption.description}
                      </span>
                      {selected && modeOption.id === 'satisfaction' && (
                        <span style={{ display: 'grid', gap: '0.2rem', marginTop: '0.45rem' }}>
                          {satisfactionModeNotes.map((note) => (
                            <span key={note} style={{ display: 'flex', gap: '0.35rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                              <span style={{ color: modeOption.accent }}>→</span>
                              <span>{note}</span>
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
          {createError && <p style={{ color: 'var(--accent)', fontSize: '0.75rem' }}>{createError}</p>}
          <button
            type="submit"
            disabled={creating || !name.trim() || !!activeSession || maxGroupSize < minGroupSize}
            style={{ ...btn, alignSelf: 'flex-start' }}
            data-testid="matching-session-submit"
          >
            {creating ? 'Создаю…' : 'Создать сессию'}
          </button>
        </form>
      </div>

      {selectedSession && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ ...microLabel, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            Аналитика изменений предпочтений
            <button onClick={() => loadPreferenceEvents(selectedSession.id)} style={{ ...btn, fontSize: '0.7rem', padding: '2px 6px' }}>
              ↺
            </button>
          </div>
          {preferenceEventsLoading && <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Загрузка…</p>}
          {!preferenceEventsLoading && preferenceEvents.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              {isSelectedActive
                ? 'После входа в сессию участники ещё не меняли предпочтения.'
                : 'В этой сессии не было изменений предпочтений.'}
            </p>
          )}
          {!preferenceEventsLoading && preferenceEvents.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
                {Object.entries(countPreferenceEvents(preferenceEvents)).map(([type, count]) => (
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
                    {eventTypeLabel(type)}: {count}
                  </span>
                ))}
              </div>

              {/* Per-column filters — Когда | Событие | Источник | Участник | Актор */}
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
                    <option key={type} value={type}>{eventTypeLabel(type)}</option>
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
                    <option key={src} value={src}>{sourceLabel(src)}</option>
                  ))}
                </select>
                <select
                  aria-label="Фильтр по участнику"
                  value={eventFilters.participant}
                  onChange={e => updateEventFilter('participant', e.target.value)}
                  style={filterSelectStyle}
                >
                  <option value="">Участник: все</option>
                  {eventFilterOptions.participants.map(p => (
                    <option key={p} value={p}>{p}</option>
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
                {(eventFilters.day || eventFilters.eventType || eventFilters.source || eventFilters.participant || eventFilters.actor) && (
                  <button
                    onClick={() => { setEventFilters(EMPTY_FILTERS); setVisibleEventsCount(PREFERENCE_EVENTS_PAGE_SIZE) }}
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
                        <th style={{ padding: '3px 8px' }}>Участник</th>
                        <th style={{ padding: '3px 8px' }}>Актор</th>
                        <th style={{ padding: '3px 8px' }}>Деталь</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEvents.slice(0, visibleEventsCount).map(event => (
                        <tr key={event.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '3px 8px 3px 0', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {new Date(event.occurredAt).toLocaleString('ru-RU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '3px 8px', color: 'var(--text-body)' }}>{eventTypeLabel(event.eventType)}</td>
                          <td style={{ padding: '3px 8px', color: 'var(--text-secondary)' }}>{sourceLabel(event.source)}</td>
                          <td style={{ padding: '3px 8px', color: 'var(--text-secondary)' }}>{participantLabel(event)}</td>
                          <td style={{ padding: '3px 8px', color: 'var(--text-secondary)' }}>{actorLabel(event)}</td>
                          <td style={{ padding: '3px 8px', color: 'var(--text-muted)' }}>{eventDetail(event)}</td>
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
                        onClick={() => setVisibleEventsCount(c => c + PREFERENCE_EVENTS_PAGE_SIZE)}
                        data-testid="admin-matching-preference-show-more"
                        style={{ ...btn, fontSize: '0.72rem' }}
                      >
                        Показать ещё {Math.min(PREFERENCE_EVENTS_PAGE_SIZE, filteredEvents.length - visibleEventsCount)}
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

function countPreferenceEvents(events: PreferenceEvent[]): Record<string, number> {
  return events.reduce<Record<string, number>>((acc, event) => {
    acc[event.eventType] = (acc[event.eventType] ?? 0) + 1
    return acc
  }, {})
}
