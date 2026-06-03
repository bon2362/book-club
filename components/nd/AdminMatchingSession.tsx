'use client'

import { useState, useEffect, useCallback } from 'react'

interface MatchingSession {
  id: string
  name: string
  status: string
  minGroupSize: number
  maxGroupSize: number
  deadlineAt: string | null
  createdAt: string
  frozenAt: string | null
}

interface AuditEntry {
  id: string
  adminId: string
  viewedUserId: string
  ts: string
  adminName: string | null
}

interface PreferenceEvent {
  id: string
  sessionId: string
  userId: string
  actorUserId: string
  eventType: string
  source: string
  bookId: string | null
  metadata: { bookTitle?: string | null; selectedBookIds?: string[]; bookIds?: string[] } | null
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
  borderRadius: 2,
}

export default function AdminMatchingSession() {
  const [sessions, setSessions] = useState<MatchingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [preferenceEvents, setPreferenceEvents] = useState<PreferenceEvent[]>([])
  const [preferenceEventsLoading, setPreferenceEventsLoading] = useState(false)

  const [participants, setParticipants] = useState<Participant[]>([])
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

  const loadAudit = useCallback(async (sessionId: string) => {
    setAuditLoading(true)
    try {
      const res = await fetch(`/api/matching/sessions/${sessionId}/audit-log`)
      const json = await res.json()
      if (res.ok) setAuditLog(json.data ?? [])
    } finally {
      setAuditLoading(false)
    }
  }, [])

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
      if (res.ok) setParticipants(json.data ?? [])
    } finally {
      setParticipantsLoading(false)
    }
  }, [])

  const loadAllUsers = useCallback(async () => {
    const res = await fetch('/api/admin/users')
    const json = await res.json()
    if (res.ok) setAllUsers(json.data ?? [])
  }, [])

  useEffect(() => {
    const active = sessions.find(s => s.status === 'active')
    if (active) {
      loadAudit(active.id)
      loadPreferenceEvents(active.id)
      loadParticipants(active.id)
      loadAllUsers()
    }
  }, [sessions, loadAudit, loadPreferenceEvents, loadParticipants, loadAllUsers])

  const activeSession = sessions.find(s => s.status === 'active')
  const [freezing, setFreezing] = useState(false)
  const [freezeError, setFreezeError] = useState<string | null>(null)

  async function handleAddParticipant() {
    if (!activeSession || !selectedUserId) return
    setAddingParticipant(true)
    try {
      const res = await fetch(`/api/admin/matching/sessions/${activeSession.id}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId }),
      })
      if (res.ok) {
        setSelectedUserId('')
        await loadParticipants(activeSession.id)
      }
    } finally {
      setAddingParticipant(false)
    }
  }

  async function handleRemoveParticipant(userId: string) {
    if (!activeSession) return
    setRemovingUserId(userId)
    try {
      const res = await fetch(
        `/api/admin/matching/sessions/${activeSession.id}/participants/${userId}`,
        { method: 'DELETE' },
      )
      if (res.ok) {
        await loadParticipants(activeSession.id)
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
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Ошибка создания')
      setName('')
      setDeadlineAt('')
      setMinGroupSize(3)
      setMaxGroupSize(3)
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

      {!loading && activeSession && (
        <div style={{ marginBottom: '1.5rem', padding: '0.8rem', border: '1px solid var(--border-strong)', borderRadius: 3 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Активная сессия</div>
          <div>Название: {activeSession.name}</div>
          <div>
            Размер группы: {activeSession.minGroupSize === activeSession.maxGroupSize
              ? activeSession.minGroupSize
              : `${activeSession.minGroupSize}-${activeSession.maxGroupSize}`}
          </div>
          {activeSession.deadlineAt && (
            <div>Дедлайн: {new Date(activeSession.deadlineAt).toLocaleString('ru-RU')}</div>
          )}
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
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
          {freezeError && <p style={{ color: 'var(--accent)', fontSize: '0.75rem', marginTop: 4 }}>{freezeError}</p>}
        </div>
      )}

      {!loading && activeSession && (
        <div style={{ marginBottom: '1.5rem', padding: '0.8rem', border: '1px solid var(--border-strong)', borderRadius: 3 }}>
          <div style={{ fontWeight: 600, marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            Участники ({participants.length})
            <button
              onClick={() => loadParticipants(activeSession.id)}
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
                  <th style={{ padding: '3px 8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {participants.map(p => (
                  <tr key={p.userId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '3px 8px 3px 0', fontWeight: 500 }}>{p.pseudonym}</td>
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
                    <td style={{ padding: '3px 8px' }}>
                      <button
                        onClick={() => handleRemoveParticipant(p.userId)}
                        disabled={removingUserId === p.userId}
                        style={{ ...btn, fontSize: '0.7rem', padding: '1px 6px', color: 'var(--accent)', borderColor: 'var(--accent)' }}
                      >
                        {removingUserId === p.userId ? '…' : 'Убрать'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
              style={{ ...fieldInput, width: 'auto', minWidth: 160, border: '1px solid var(--border)', padding: '4px 6px', borderRadius: 2 }}
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

      {!loading && !activeSession && (
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Активных сессий нет.</p>
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

      {activeSession && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            Аналитика изменений предпочтений
            <button onClick={() => loadPreferenceEvents(activeSession.id)} style={{ ...btn, fontSize: '0.7rem', padding: '2px 6px' }}>
              ↺
            </button>
          </div>
          {preferenceEventsLoading && <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Загрузка…</p>}
          {!preferenceEventsLoading && preferenceEvents.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              После входа в сессию участники ещё не меняли предпочтения.
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
                  {preferenceEvents.slice(0, 25).map(event => (
                    <tr key={event.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '3px 8px 3px 0', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(event.occurredAt).toLocaleString('ru-RU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '3px 8px', color: 'var(--text-body)' }}>{eventTypeLabel(event.eventType)}</td>
                      <td style={{ padding: '3px 8px', color: 'var(--text-secondary)' }}>{sourceLabel(event.source)}</td>
                      <td style={{ padding: '3px 8px', color: 'var(--text-secondary)' }}>{displayParticipant(event.userId, participants)}</td>
                      <td style={{ padding: '3px 8px', color: 'var(--text-secondary)' }}>{displayParticipant(event.actorUserId, participants)}</td>
                      <td style={{ padding: '3px 8px', color: 'var(--text-muted)' }}>{eventDetail(event)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {activeSession && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            Журнал просмотров (admin_views)
            <button onClick={() => loadAudit(activeSession.id)} style={{ ...btn, fontSize: '0.7rem', padding: '2px 6px' }}>
              ↺
            </button>
          </div>
          {auditLoading && <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Загрузка…</p>}
          {!auditLoading && auditLog.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Просмотров за других участников не было.</p>
          )}
          {!auditLoading && auditLog.length > 0 && (
            <table
              data-testid="admin-audit-log"
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}
            >
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '3px 8px 3px 0' }}>Когда</th>
                  <th style={{ padding: '3px 8px' }}>Администратор</th>
                  <th style={{ padding: '3px 8px' }}>Просматривал</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map(entry => (
                  <tr key={entry.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '3px 8px 3px 0', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(entry.ts).toLocaleString('ru-RU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '3px 8px', color: 'var(--text-secondary)' }}>
                      {entry.adminName ?? entry.adminId.slice(0, 8)}
                    </td>
                    <td style={{ padding: '3px 8px' }}>
                      <a
                        href={`/matching?as=${entry.viewedUserId}`}
                        style={{ color: 'var(--text-body)', textDecoration: 'underline' }}
                        title={entry.viewedUserId}
                      >
                        {entry.viewedUserId.slice(0, 12)}…
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {sessions.filter(s => s.status !== 'active').length > 0 && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Прошлые сессии</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '4px 8px 4px 0' }}>Название</th>
                <th style={{ padding: '4px 8px' }}>Статус</th>
                <th style={{ padding: '4px 8px' }}>Создана</th>
                <th style={{ padding: '4px 8px' }}>Заморожена</th>
              </tr>
            </thead>
            <tbody>
              {sessions.filter(s => s.status !== 'active').map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '4px 8px 4px 0' }}>{s.name}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-secondary)' }}>{s.status}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-muted)' }}>
                    {new Date(s.createdAt).toLocaleDateString('ru-RU')}
                  </td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-muted)' }}>
                    {s.frozenAt ? new Date(s.frozenAt).toLocaleDateString('ru-RU') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

function eventTypeLabel(eventType: string): string {
  if (eventType === 'book_added') return 'Добавлена книга'
  if (eventType === 'book_removed') return 'Убрана книга'
  if (eventType === 'rank_changed') return 'Ранги'
  if (eventType === 'status_changed') return 'Статус'
  if (eventType === 'catalog_signup_updated') return 'Список'
  if (eventType === 'priorities_updated') return 'Приоритеты'
  return eventType
}

function sourceLabel(source: string): string {
  if (source === 'matching') return 'Матчинг'
  if (source === 'catalog') return 'Каталог'
  if (source === 'profile') return 'Профиль'
  if (source === 'admin') return 'Админка'
  return source
}

function displayParticipant(userId: string, participants: Participant[]): string {
  const participant = participants.find((item) => item.userId === userId)
  return participant?.pseudonym ?? `${userId.slice(0, 12)}…`
}

function eventDetail(event: PreferenceEvent): string {
  if (event.metadata?.bookTitle) return event.metadata.bookTitle
  if (event.metadata?.selectedBookIds) return `${event.metadata.selectedBookIds.length} книг`
  if (event.metadata?.bookIds) return `${event.metadata.bookIds.length} книг`
  return event.bookId ?? '—'
}
