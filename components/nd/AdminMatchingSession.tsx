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

  const activeSession = sessions.find(s => s.status === 'active')

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
          <div style={{ marginTop: 8 }}>
            <a
              href="/matching"
              style={{ color: '#333', textDecoration: 'underline', fontSize: '0.78rem' }}
            >
              Открыть страницу матчинга →
            </a>
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
