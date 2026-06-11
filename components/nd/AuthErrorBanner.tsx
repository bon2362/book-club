'use client'
import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

export default function AuthErrorBanner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)
  if (dismissed || searchParams.get('auth') !== 'failed') return null
  function dismiss() { setDismissed(true); router.replace('/') }
  return (
    <div role="alert" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
      background: 'var(--bg-input)', borderLeft: '3px solid var(--accent)',
      borderBottom: '1px solid var(--border-strong)', padding: '0.75rem 1.25rem',
    }}>
      <span style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.85rem', color: 'var(--text)' }}>
        Не получилось войти через Telegram. Попробуйте ещё раз.
      </span>
      <button onClick={dismiss} aria-label="Закрыть" style={{
        background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem',
        color: 'var(--text-muted)', lineHeight: 1, padding: '0.2rem',
        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
      }}>✕</button>
    </div>
  )
}
