'use client'

import { useState, useEffect, useCallback } from 'react'

interface MatchingSession {
  id: string
  name: string
  status: string
  targetGroupSize: number
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
  borderBottom: '1px solid #ccc',
  outline: 'none',
  padding: '2px 0',
  background: 'transparent',
  width: '100%',
}

const btn: React.CSSProperties = {
  fontFamily: 'var(--nd-mono), monospace',
  fontSize: '0.75rem',
  border: '1px solid #ccc',
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

  const [participants, setParticipants] = useState<Participant[]>([])
  const [allUsers, setAllUsers] = useState<AllUser[]>([])
  const [participantsLoading, setParticipantsLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [addingParticipant, setAddingParticipant] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [targetGroupSize, setTargetGroupSize] = useState(3)
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
      loadParticipants(active.id)
      loadAllUsers()
    }
  }, [sessions, loadAudit, loadParticipants, loadAllUsers])

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
          targetGroupSize,
          deadlineAt: deadlineAt || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Ошибка создания')
      setName('')
      setDeadlineAt('')
      setTargetGroupSize(3)
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

      {loading && <p style={{ color: '#999' }}>Загрузка…</p>}
      {error && <p style={{ color: '#c00' }}>{error}</p>}

      {!loading && activeSession && (
        <div style={{ marginBottom: '1.5rem', padding: '0.8rem', border: '1px solid #333', borderRadius: 3 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Активная сессия</div>
          <div>Название: {activeSession.name}</div>
          <div>Размер группы: {activeSession.targetGroupSize}</div>
          {activeSession.deadlineAt && (
            <div>Дедлайн: {new Date(activeSession.deadlineAt).toLocaleString('ru-RU')}</div>
          )}
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <a
              href="/matching"
              style={{ color: '#333', textDecoration: 'underline', fontSize: '0.78rem' }}
            >
              Открыть страницу матчинга →
            </a>
            <button
              onClick={handleFreeze}
              disabled={freezing}
              style={{ ...btn, borderColor: '#c00', color: '#c00' }}
              data-testid="admin-freeze-session"
            >
              {freezing ? 'Фиксирую…' : 'Зафиксировать'}
            </button>
          </div>
          {freezeError && <p style={{ color: '#c00', fontSize: '0.75rem', marginTop: 4 }}>{freezeError}</p>}
        </div>
      )}

      {!loading && activeSession && (
        <div style={{ marginBottom: '1.5rem', padding: '0.8rem', border: '1px solid #333', borderRadius: 3 }}>
          <div style={{ fontWeight: 600, marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            Участники ({participants.length})
            <button
              onClick={() => loadParticipants(activeSession.id)}
              style={{ ...btn, fontSize: '0.7rem', padding: '2px 6px' }}
            >
              ↺
            </button>
          </div>

          {participantsLoading && <p style={{ color: '#999', fontSize: '0.78rem' }}>Загрузка…</p>}

          {!participantsLoading && participants.length === 0 && (
            <p style={{ color: '#999', fontSize: '0.78rem' }}>Нет участников.</p>
          )}

          {!participantsLoading && participants.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', marginBottom: '0.75rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
                  <th style={{ padding: '3px 8px 3px 0' }}>Псевдоним</th>
                  <th style={{ padding: '3px 8px' }}>Пользователь</th>
                  <th style={{ padding: '3px 8px' }}>Вступил</th>
                  <th style={{ padding: '3px 8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {participants.map(p => (
                  <tr key={p.userId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '3px 8px 3px 0', fontWeight: 500 }}>{p.pseudonym}</td>
                    <td style={{ padding: '3px 8px', color: '#555' }}>
                      <a
                        href={`/matching?as=${p.userId}`}
                        style={{ color: '#333', textDecoration: 'underline' }}
                        title={p.userId}
                      >
                        {p.name ?? p.userId.slice(0, 12) + '…'}
                      </a>
                    </td>
                    <td style={{ padding: '3px 8px', color: '#999', whiteSpace: 'nowrap' }}>
                      {new Date(p.joinedAt).toLocaleString('ru-RU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '3px 8px' }}>
                      <button
                        onClick={() => handleRemoveParticipant(p.userId)}
                        disabled={removingUserId === p.userId}
                        style={{ ...btn, fontSize: '0.7rem', padding: '1px 6px', color: '#c00', borderColor: '#c00' }}
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
              style={{ ...fieldInput, width: 'auto', minWidth: 160, border: '1px solid #ccc', padding: '4px 6px', borderRadius: 2 }}
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
        <p style={{ color: '#999', marginBottom: '1rem' }}>Активных сессий нет.</p>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.6rem' }}>
          {activeSession ? 'Создать новую сессию (заменит активную после её заморозки)' : 'Создать новую сессию'}
        </div>
        {activeSession && (
          <p style={{ color: '#c60', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
            ⚠ Уже есть активная сессия. Сначала заморозьте её, затем создайте новую.
          </p>
        )}
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxWidth: 400 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', color: '#666', marginBottom: 2 }}>
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
            <label style={{ display: 'block', fontSize: '0.72rem', color: '#666', marginBottom: 2 }}>
              Размер группы
            </label>
            <input
              type="number"
              min={2}
              max={10}
              value={targetGroupSize}
              onChange={e => setTargetGroupSize(Number(e.target.value))}
              disabled={creating || !!activeSession}
              style={{ ...fieldInput, width: 60 }}
              data-testid="matching-session-group-size"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', color: '#666', marginBottom: 2 }}>
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
          {createError && <p style={{ color: '#c00', fontSize: '0.75rem' }}>{createError}</p>}
          <button
            type="submit"
            disabled={creating || !name.trim() || !!activeSession}
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
            Журнал просмотров (admin_views)
            <button onClick={() => loadAudit(activeSession.id)} style={{ ...btn, fontSize: '0.7rem', padding: '2px 6px' }}>
              ↺
            </button>
          </div>
          {auditLoading && <p style={{ color: '#999', fontSize: '0.78rem' }}>Загрузка…</p>}
          {!auditLoading && auditLog.length === 0 && (
            <p style={{ color: '#999', fontSize: '0.78rem' }}>Просмотров за других участников не было.</p>
          )}
          {!auditLoading && auditLog.length > 0 && (
            <table
              data-testid="admin-audit-log"
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}
            >
              <thead>
                <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
                  <th style={{ padding: '3px 8px 3px 0' }}>Когда</th>
                  <th style={{ padding: '3px 8px' }}>Администратор</th>
                  <th style={{ padding: '3px 8px' }}>Просматривал</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map(entry => (
                  <tr key={entry.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '3px 8px 3px 0', color: '#999', whiteSpace: 'nowrap' }}>
                      {new Date(entry.ts).toLocaleString('ru-RU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '3px 8px', color: '#555' }}>
                      {entry.adminName ?? entry.adminId.slice(0, 8)}
                    </td>
                    <td style={{ padding: '3px 8px' }}>
                      <a
                        href={`/matching?as=${entry.viewedUserId}`}
                        style={{ color: '#333', textDecoration: 'underline' }}
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
              <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
                <th style={{ padding: '4px 8px 4px 0' }}>Название</th>
                <th style={{ padding: '4px 8px' }}>Статус</th>
                <th style={{ padding: '4px 8px' }}>Создана</th>
                <th style={{ padding: '4px 8px' }}>Заморожена</th>
              </tr>
            </thead>
            <tbody>
              {sessions.filter(s => s.status !== 'active').map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '4px 8px 4px 0' }}>{s.name}</td>
                  <td style={{ padding: '4px 8px', color: '#666' }}>{s.status}</td>
                  <td style={{ padding: '4px 8px', color: '#999' }}>
                    {new Date(s.createdAt).toLocaleDateString('ru-RU')}
                  </td>
                  <td style={{ padding: '4px 8px', color: '#999' }}>
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
