'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  sessionId: string
  sessionName: string
  /** Global profile name, pre-populated from users.name */
  initialName: string
}

const pageStyle: React.CSSProperties = {
  minHeight: '100svh',
  background: 'var(--bg)',
  color: 'var(--text)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
}

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 432,
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderTop: '2px solid var(--text)',
  borderRadius: 'var(--radius)',
  padding: 'clamp(1.6rem, 5vw, 2.4rem)',
}

export default function MatchingWelcome({ sessionId, sessionName, initialName }: Props) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleJoin() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Введите имя')
      return
    }
    setJoining(true)
    setError(null)
    try {
      const res = await fetch(`/api/matching/sessions/${sessionId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Не удалось войти в сессию')
      router.refresh()
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Не удалось войти в сессию')
    } finally {
      setJoining(false)
    }
  }

  return (
    <main style={pageStyle}>
      <section style={{ ...cardStyle, position: 'relative' }} aria-labelledby="matching-welcome-title">
        <div className="t-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />
          Долгое наступление · читательский клуб
        </div>
        <h1
          id="matching-welcome-title"
          style={{
            margin: '0.7rem 0 0',
            fontFamily: 'var(--nd-serif)',
            fontSize: 'clamp(1.35rem, 6vw, 1.7rem)',
            lineHeight: 1.12,
            fontWeight: 700,
            color: 'var(--text)',
          }}
        >
          {sessionName}
        </h1>
        <p style={{ margin: '0.55rem 0 0', fontFamily: 'var(--nd-serif)', fontSize: '0.95rem', lineHeight: 1.5, color: 'var(--text-body)' }}>
          Ты видишь, что хотят читать остальные. После того как все подтвердят круг, страница остаётся доступна для наблюдения.
        </p>

        {/* Real name disclosure */}
        <div
          style={{
            marginTop: '1rem',
            borderLeft: '3px solid var(--accent)',
            background: 'var(--bg-tint)',
            padding: '0.75rem 0.9rem',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.84rem', lineHeight: 1.5, color: 'var(--text-body)' }}>
            <strong style={{ color: 'var(--text)' }}>Реальные имена видны всем участникам.</strong>{' '}
            Это нужно, чтобы составить группы и общаться через Telegram. Твоё имя будет отображаться рядом с твоими книгами и кругами.
          </p>
        </div>

        {/* Name field */}
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <label
            htmlFor="welcome-name"
            className="t-eyebrow"
          >
            Твоё имя
          </label>
          <input
            id="welcome-name"
            data-testid="welcome-name-input"
            type="text"
            className="p-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={joining}
            placeholder="Имя"
            style={{ boxSizing: 'border-box' }}
          />
          <p style={{ margin: 0, fontSize: '0.72rem', lineHeight: 1.45, color: 'var(--text-muted)' }}>
            Сессия: {sessionName}
          </p>
        </div>

        {error && (
          <p role="alert" style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: 'var(--accent)' }}>
            {error}
          </p>
        )}

        <button
          type="button"
          data-testid="welcome-join-button"
          onClick={handleJoin}
          disabled={joining}
          className="p-btn block"
          style={{ marginTop: '1rem' }}
        >
          {joining ? 'Входим…' : 'Войти'}
        </button>
        <p style={{ margin: '0.55rem 0 0', textAlign: 'center', fontSize: '0.72rem', lineHeight: 1.45, color: 'var(--text-muted)' }}>
          После входа твои книги начинают влиять на сценарии.
        </p>
      </section>
    </main>
  )
}
