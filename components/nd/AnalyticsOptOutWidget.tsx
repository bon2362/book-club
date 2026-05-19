'use client'

import { useEffect, useState } from 'react'
import posthog from 'posthog-js'

type Status = 'loading' | 'opted_out' | 'tracking'

export default function AnalyticsOptOutWidget() {
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    setStatus(posthog.has_opted_out_capturing() ? 'opted_out' : 'tracking')
  }, [])

  function optOut() {
    posthog.opt_out_capturing()
    setStatus('opted_out')
  }

  function optIn() {
    posthog.opt_in_capturing()
    setStatus('tracking')
  }

  const containerStyle: React.CSSProperties = {
    border: '1px solid #E5E5E5',
    background: '#fff',
    padding: '0.75rem 1rem',
    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '0.6rem',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: '#999',
    marginBottom: '0.5rem',
  }

  const buttonStyle: React.CSSProperties = {
    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
    fontSize: '0.68rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    cursor: 'pointer',
    padding: '0.3rem 0.6rem',
    border: '1px solid #111',
    background: '#fff',
    color: '#222',
  }

  return (
    <div style={containerStyle}>
      <div style={labelStyle}>PostHog · этот браузер</div>
      {status === 'loading' && (
        <div style={{ fontSize: '0.85rem', color: '#999' }}>Проверяем…</div>
      )}
      {status === 'opted_out' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.85rem', color: '#2D6A4F' }}>
            ✓ Аналитика отключена — визиты с этого браузера не считаются
          </span>
          <button type="button" onClick={optIn} style={{ ...buttonStyle, color: '#999', borderColor: '#ccc' }}>
            Включить обратно
          </button>
        </div>
      )}
      {status === 'tracking' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.85rem', color: '#C0603A' }}>
            ✗ Аналитика включена — визиты с этого браузера попадают в статистику
          </span>
          <button type="button" onClick={optOut} style={buttonStyle}>
            Отключить для этого браузера
          </button>
        </div>
      )}
      {status === 'tracking' && (
        <div style={{ fontSize: '0.7rem', color: '#999', marginTop: '0.4rem' }}>
          После отключения статус сохраняется навсегда в этом браузере — даже без логина и при смене аккаунта. При очистке кэша/куки нужно нажать снова.
        </div>
      )}
    </div>
  )
}
