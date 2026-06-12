'use client'
import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

export default function AuthErrorBanner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)
  const authFailed = searchParams.get('auth') === 'failed'
  const accountLinkStatus = searchParams.get('account_link')
  const accountLinkMessages: Record<string, { text: string; tone: 'success' | 'error' }> = {
    telegram_ok: { text: 'Telegram привязан к вашему профилю.', tone: 'success' },
    telegram_conflict: { text: 'Этот Telegram уже привязан к другому профилю. Напишите организатору, чтобы объединить аккаунты.', tone: 'error' },
    telegram_failed: { text: 'Не удалось привязать Telegram. Попробуйте ещё раз.', tone: 'error' },
    telegram_state_failed: { text: 'Сессия привязки Telegram устарела. Откройте профиль и попробуйте ещё раз.', tone: 'error' },
    telegram_unauthorized: { text: 'Войдите в профиль перед привязкой Telegram.', tone: 'error' },
  }
  const accountLinkMessage = accountLinkStatus ? accountLinkMessages[accountLinkStatus] : null
  if (dismissed || (!authFailed && !accountLinkMessage)) return null
  function dismiss() { setDismissed(true); router.replace('/') }
  const tone = accountLinkMessage?.tone ?? 'error'
  return (
    <div role="alert" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
      background: 'var(--bg-input)', borderLeft: `3px solid ${tone === 'success' ? 'var(--success)' : 'var(--accent)'}`,
      borderBottom: '1px solid var(--border-strong)', padding: '0.75rem 1.25rem',
    }}>
      <span style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.85rem', color: 'var(--text)' }}>
        {accountLinkMessage?.text ?? 'Не получилось войти через Telegram. Попробуйте ещё раз.'}
      </span>
      <button onClick={dismiss} aria-label="Закрыть" style={{
        background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem',
        color: 'var(--text-muted)', lineHeight: 1, padding: '0.2rem',
        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
      }}>✕</button>
    </div>
  )
}
