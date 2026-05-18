'use client'

import { useEffect, useState } from 'react'

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'not_configured' }
  | { kind: 'ok'; eventsThisMonth: number; limit: number }

function formatNumber(n: number): string {
  return n.toLocaleString('ru-RU')
}

function pickColor(ratio: number): string {
  if (ratio >= 0.9) return '#C0603A'
  if (ratio >= 0.7) return '#C49B3A'
  return '#2D6A4F'
}

export default function PostHogUsageWidget() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/posthog-usage', { cache: 'no-store' })
      .then(async res => {
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.status === 503 && data?.error === 'not_configured') {
          setState({ kind: 'not_configured' })
          return
        }
        if (!res.ok) {
          setState({ kind: 'error', message: data?.error ?? `HTTP ${res.status}` })
          return
        }
        setState({
          kind: 'ok',
          eventsThisMonth: Number(data.eventsThisMonth ?? 0),
          limit: Number(data.limit ?? 1_000_000),
        })
      })
      .catch(err => {
        if (!cancelled) setState({ kind: 'error', message: err.message })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const containerStyle: React.CSSProperties = {
    border: '1px solid #E5E5E5',
    background: '#fff',
    padding: '1rem 1.25rem',
    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
    marginBottom: '1.5rem',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '0.6rem',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: '#999',
    marginBottom: '0.5rem',
  }

  if (state.kind === 'loading') {
    return (
      <div style={containerStyle}>
        <div style={labelStyle}>PostHog · события за месяц</div>
        <div style={{ fontSize: '0.85rem', color: '#999' }}>Загружаем…</div>
      </div>
    )
  }

  if (state.kind === 'not_configured') {
    return (
      <div style={containerStyle}>
        <div style={labelStyle}>PostHog · события за месяц</div>
        <div style={{ fontSize: '0.85rem', color: '#999' }}>
          Не настроены env-переменные <code>POSTHOG_PERSONAL_API_KEY</code> и <code>POSTHOG_PROJECT_ID</code>
        </div>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div style={containerStyle}>
        <div style={labelStyle}>PostHog · события за месяц</div>
        <div style={{ fontSize: '0.85rem', color: '#C0603A' }}>
          Не удалось получить данные: {state.message}
        </div>
      </div>
    )
  }

  const ratio = Math.min(state.eventsThisMonth / state.limit, 1)
  const percent = (ratio * 100).toFixed(ratio >= 0.01 ? 1 : 2)
  const color = pickColor(ratio)

  return (
    <div style={containerStyle}>
      <div style={labelStyle}>PostHog · события за месяц</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111' }}>
          {formatNumber(state.eventsThisMonth)}
        </span>
        <span style={{ fontSize: '0.85rem', color: '#666' }}>
          из {formatNumber(state.limit)}
        </span>
        <span style={{ fontSize: '0.75rem', color, marginLeft: 'auto' }}>{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={state.eventsThisMonth}
        aria-valuemin={0}
        aria-valuemax={state.limit}
        style={{ height: 6, background: '#F0F0F0', position: 'relative', marginBottom: '0.5rem' }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: `${ratio * 100}%`,
            background: color,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <div style={{ fontSize: '0.7rem', color: '#999' }}>
        Лимит сбрасывается 1-го числа. При превышении биллинг-лимита события начнут отбрасываться.
      </div>
    </div>
  )
}
