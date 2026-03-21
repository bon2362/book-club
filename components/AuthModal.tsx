'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function AuthModal({ isOpen, onClose }: Props) {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    try {
      await signIn('resend', { email: email.trim(), redirect: false })
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    /* Overlay */
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26, 23, 20, 0.72)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      {/* Modal panel */}
      <div
        style={{
          position: 'relative',
          background: 'var(--bg)',
          width: '100%',
          maxWidth: '420px',
          padding: '2.5rem 2.25rem 2.25rem',
          borderLeft: '4px solid var(--accent)',
          boxShadow: '6px 6px 0 rgba(181,69,27,0.13), 0 8px 32px rgba(0,0,0,0.22)',
          fontFamily: "'Playfair Display', 'Georgia', 'Times New Roman', serif",
          overflow: 'hidden',
        }}
      >
        {/* Decorative corner mark — top-right */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 0,
            height: 0,
            borderStyle: 'solid',
            borderWidth: '0 36px 36px 0',
            borderColor: 'transparent var(--accent) transparent transparent',
            opacity: 0.18,
          }}
        />

        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Закрыть"
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: "'Georgia', serif",
            fontSize: '1.125rem',
            color: 'var(--text-muted)',
            lineHeight: 1,
            padding: '0.2rem 0.4rem',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
        >
          ✕
        </button>

        {/* Heading */}
        <h2
          style={{
            fontFamily: "'Playfair Display', 'Georgia', serif",
            fontWeight: 700,
            fontSize: '1.5rem',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            color: 'var(--text)',
            margin: '0 0 0.3rem 0',
          }}
        >
          Войти в круг
        </h2>

        {/* Subtitle */}
        <p
          style={{
            fontFamily: "'Georgia', serif",
            fontStyle: 'italic',
            fontSize: '0.8125rem',
            color: 'var(--text-muted)',
            letterSpacing: '0.02em',
            margin: '0.75rem 0 1.75rem 0',
          }}
        >
          войдите, чтобы записаться на книги
        </p>

        {/* Google sign-in button */}
        <button
          onClick={() => signIn('google')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.625rem',
            width: '100%',
            padding: '0.75rem 1rem',
            fontFamily: "'Playfair Display', 'Georgia', serif",
            fontWeight: 600,
            fontSize: '0.9rem',
            letterSpacing: '0.03em',
            cursor: 'pointer',
            border: '2px solid var(--text)',
            background: 'var(--text)',
            color: 'var(--bg)',
            transition: 'background 0.18s, color 0.18s',
            marginBottom: '0.25rem',
          }}
          onMouseEnter={e => {
            const btn = e.currentTarget as HTMLButtonElement
            btn.style.background = 'var(--text-secondary)'
            btn.style.borderColor = 'var(--text-secondary)'
          }}
          onMouseLeave={e => {
            const btn = e.currentTarget as HTMLButtonElement
            btn.style.background = 'var(--text)'
            btn.style.borderColor = 'var(--text)'
          }}
        >
          {/* Google icon */}
          <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="currentColor" opacity="0.85" />
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="currentColor" opacity="0.7" />
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="currentColor" opacity="0.6" />
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="currentColor" opacity="0.55" />
          </svg>
          Войти через Google
        </button>

        {/* Email auth hidden until custom domain is configured in Resend */}
        {false && (submitted ? (
          <div style={{ borderLeft: '3px solid var(--success)', paddingLeft: '1rem', paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
            <p style={{ fontFamily: "'Georgia', serif", fontStyle: 'italic', fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--success)', margin: 0 }}>
              Проверьте почту — мы отправили вам ссылку для входа
            </p>
          </div>
        ) : (
          <form onSubmit={handleEmailSubmit} noValidate>
            <label htmlFor="auth-email" style={{ display: 'block', fontFamily: "'Georgia', serif", fontSize: '0.675rem', letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ display: 'block', width: '100%', padding: '0.625rem 0.75rem', fontFamily: "'Georgia', serif", fontSize: '0.9rem', color: 'var(--text)', background: 'var(--bg-input)', border: '1px solid var(--border)', borderBottom: '2px solid var(--accent)', outline: 'none', boxSizing: 'border-box' as const, marginBottom: '1rem' }}
              onFocus={e => { e.currentTarget.style.background = 'var(--bg-input-focus)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
              onBlur={e => { e.currentTarget.style.background = 'var(--bg-input)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.borderBottomColor = 'var(--accent)' }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{ display: 'block', width: '100%', padding: '0.7rem 1rem', fontFamily: "'Playfair Display', 'Georgia', serif", fontWeight: 600, fontSize: '0.875rem', letterSpacing: '0.04em', cursor: loading ? 'default' : 'pointer', border: '2px solid var(--accent)', background: loading ? 'var(--border-subtle)' : 'transparent', color: loading ? 'var(--text-muted)' : 'var(--accent)', transition: 'all 0.18s' }}
              onMouseEnter={e => { if (!loading) { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'var(--accent)'; b.style.color = 'var(--bg)' } }}
              onMouseLeave={e => { if (!loading) { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'transparent'; b.style.color = 'var(--accent)' } }}
            >
              {loading ? 'Отправляем…' : 'Отправить ссылку'}
            </button>
          </form>
        ))}
      </div>
    </div>
  )
}
