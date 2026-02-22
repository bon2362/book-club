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
          background: '#F9F5EE',
          width: '100%',
          maxWidth: '420px',
          padding: '2.5rem 2.25rem 2.25rem',
          borderLeft: '4px solid #B5451B',
          boxShadow: '6px 6px 0 #B5451B22, 0 8px 32px rgba(0,0,0,0.22)',
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
            borderColor: 'transparent #B5451B transparent transparent',
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
            color: '#8C7B6B',
            lineHeight: 1,
            padding: '0.2rem 0.4rem',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#1A1714' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8C7B6B' }}
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
            color: '#1A1714',
            margin: '0 0 0.3rem 0',
          }}
        >
          Войти в клуб
        </h2>

        {/* Subtitle rule */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            margin: '0.75rem 0 1.75rem 0',
          }}
        >
          <span
            style={{
              fontFamily: "'Georgia', serif",
              fontStyle: 'italic',
              fontSize: '0.8125rem',
              color: '#8C7B6B',
              letterSpacing: '0.02em',
            }}
          >
            выберите способ входа
          </span>
          <div style={{ flex: 1, height: '1px', background: '#E2D8CC' }} />
        </div>

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
            border: '2px solid #1A1714',
            background: '#1A1714',
            color: '#F9F5EE',
            transition: 'background 0.18s, color 0.18s',
            marginBottom: '1.5rem',
          }}
          onMouseEnter={e => {
            const btn = e.currentTarget as HTMLButtonElement
            btn.style.background = '#3D3028'
            btn.style.borderColor = '#3D3028'
          }}
          onMouseLeave={e => {
            const btn = e.currentTarget as HTMLButtonElement
            btn.style.background = '#1A1714'
            btn.style.borderColor = '#1A1714'
          }}
        >
          {/* Google icon */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 18 18"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
          >
            <path
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
              fill="#F9F5EE"
              opacity="0.85"
            />
            <path
              d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
              fill="#F9F5EE"
              opacity="0.7"
            />
            <path
              d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
              fill="#F9F5EE"
              opacity="0.6"
            />
            <path
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
              fill="#F9F5EE"
              opacity="0.55"
            />
          </svg>
          Войти через Google
        </button>

        {/* Ornamental divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ flex: 1, height: '1px', background: '#E2D8CC' }} />
          <span
            style={{
              fontFamily: "'Georgia', serif",
              fontSize: '0.65rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#B5451B',
              opacity: 0.8,
            }}
          >
            или по email
          </span>
          <div style={{ flex: 1, height: '1px', background: '#E2D8CC' }} />
        </div>

        {submitted ? (
          /* Success state */
          <div
            style={{
              borderLeft: '3px solid #2D6A4F',
              paddingLeft: '1rem',
              paddingTop: '0.5rem',
              paddingBottom: '0.5rem',
            }}
          >
            <p
              style={{
                fontFamily: "'Georgia', serif",
                fontStyle: 'italic',
                fontSize: '0.9rem',
                lineHeight: 1.6,
                color: '#2D6A4F',
                margin: 0,
              }}
            >
              Проверьте почту — мы отправили вам ссылку для входа
            </p>
          </div>
        ) : (
          /* Email form */
          <form onSubmit={handleEmailSubmit} noValidate>
            <label
              htmlFor="auth-email"
              style={{
                display: 'block',
                fontFamily: "'Georgia', serif",
                fontSize: '0.675rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#5C4A3A',
                marginBottom: '0.4rem',
              }}
            >
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                display: 'block',
                width: '100%',
                padding: '0.625rem 0.75rem',
                fontFamily: "'Georgia', serif",
                fontSize: '0.9rem',
                color: '#1A1714',
                background: '#FDFAF5',
                border: '1px solid #D4C4B0',
                borderBottom: '2px solid #B5451B',
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: '1rem',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => {
                const inp = e.currentTarget as HTMLInputElement
                inp.style.borderColor = '#B5451B'
                inp.style.background = '#FFFFFF'
              }}
              onBlur={e => {
                const inp = e.currentTarget as HTMLInputElement
                inp.style.borderColor = '#D4C4B0'
                inp.style.borderBottomColor = '#B5451B'
                inp.style.background = '#FDFAF5'
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                display: 'block',
                width: '100%',
                padding: '0.7rem 1rem',
                fontFamily: "'Playfair Display', 'Georgia', serif",
                fontWeight: 600,
                fontSize: '0.875rem',
                letterSpacing: '0.04em',
                cursor: loading ? 'default' : 'pointer',
                border: '2px solid #B5451B',
                background: loading ? '#E2D8CC' : 'transparent',
                color: loading ? '#8C7B6B' : '#B5451B',
                transition: 'all 0.18s',
              }}
              onMouseEnter={e => {
                if (!loading) {
                  const btn = e.currentTarget as HTMLButtonElement
                  btn.style.background = '#B5451B'
                  btn.style.color = '#F9F5EE'
                }
              }}
              onMouseLeave={e => {
                if (!loading) {
                  const btn = e.currentTarget as HTMLButtonElement
                  btn.style.background = 'transparent'
                  btn.style.color = '#B5451B'
                }
              }}
            >
              {loading ? 'Отправляем…' : 'Отправить ссылку'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
