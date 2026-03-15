'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'

declare global {
  interface Window {
    onTelegramAuth: (user: Record<string, string>) => void
  }
}

const BOT_NAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function AuthModal({ isOpen, onClose }: Props) {
  const router = useRouter()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [email, setEmail] = useState('')
  const [magicState, setMagicState] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setMagicState('loading')
    try {
      const res = await signIn('resend', { email: email.trim(), redirect: false })
      setMagicState(res?.error ? 'error' : 'sent')
    } catch {
      setMagicState('error')
    }
  }

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Set up the global Telegram callback (always kept up to date)
  useEffect(() => {
    window.onTelegramAuth = async (user) => {
      await signIn('telegram', { ...user, redirect: false })
      router.refresh()
      onCloseRef.current()
    }
  }, [router])

  // Load the Telegram widget script when the modal opens
  useEffect(() => {
    if (!isOpen || !BOT_NAME) return

    const container = document.getElementById('telegram-login-container')
    if (!container) return

    container.innerHTML = ''

    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login', BOT_NAME)
    script.setAttribute('data-size', 'medium')
    script.setAttribute('data-onauth', 'onTelegramAuth')
    script.async = true
    container.appendChild(script)

    return () => {
      container.innerHTML = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  function handleOverlay(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Войти в клуб"
      onClick={handleOverlay}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        outline: 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          background: '#fff',
          width: '100%',
          maxWidth: '400px',
          padding: '2.5rem 2rem 2rem',
          border: '2px solid #111',
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Закрыть"
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '1rem',
            color: '#999',
            lineHeight: 1,
            padding: '0.2rem',
          }}
        >
          ✕
        </button>

        <p
          style={{
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.6rem',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: '#999',
            margin: '0 0 0.75rem',
          }}
        >
          Книжный клуб
        </p>

        <h2
          style={{
            fontFamily: 'var(--nd-serif), Georgia, serif',
            fontWeight: 700,
            fontSize: '1.5rem',
            color: '#111',
            margin: '0 0 0.25rem',
            letterSpacing: '-0.02em',
          }}
        >
          Войти в клуб
        </h2>

        <p
          style={{
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.8rem',
            color: '#666',
            margin: '0 0 1.75rem',
            lineHeight: 1.5,
          }}
        >
          войдите, чтобы записаться на книги
        </p>

        <div style={{ borderTop: '1px solid #111', marginBottom: '1.5rem' }} />

        <button
          onClick={() => signIn('google')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.625rem',
            width: '100%',
            padding: '0.75rem 1rem',
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.8rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            cursor: 'pointer',
            border: '1px solid #111',
            background: '#111',
            color: '#fff',
            transition: 'background 0.15s',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="currentColor" opacity="0.85" />
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="currentColor" opacity="0.7" />
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="currentColor" opacity="0.6" />
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="currentColor" opacity="0.55" />
          </svg>
          Войти через Google
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0' }}>
          <div style={{ flex: 1, height: 1, background: '#E5E5E5' }} />
          <span style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#bbb' }}>или</span>
          <div style={{ flex: 1, height: 1, background: '#E5E5E5' }} />
        </div>

        {/* Magic link */}
        {magicState === 'sent' ? (
          <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.8rem', color: '#555', lineHeight: 1.55, margin: 0, textAlign: 'center' }}>
            Проверьте почту — мы отправили ссылку для входа на <strong>{email}</strong>
          </p>
        ) : (
          <form onSubmit={handleMagicLink} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="ваш@email.com"
              required
              style={{
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.8rem',
                color: '#111',
                background: '#fff',
                border: '1px solid #E5E5E5',
                borderBottom: '2px solid #111',
                padding: '0.6rem 0.75rem',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
            {magicState === 'error' && (
              <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.75rem', color: '#C0603A', margin: 0 }}>
                Не удалось отправить письмо. Попробуйте ещё раз.
              </p>
            )}
            <button
              type="submit"
              disabled={magicState === 'loading'}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.8rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                cursor: magicState === 'loading' ? 'default' : 'pointer',
                border: '1px solid #111',
                background: 'transparent',
                color: magicState === 'loading' ? '#999' : '#111',
                borderColor: magicState === 'loading' ? '#C8C8C8' : '#111',
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {magicState === 'loading' ? 'Отправляем…' : 'Получить ссылку на почту'}
            </button>
          </form>
        )}

        {/* Telegram login hidden until OAuth delivery issue is resolved */}
        <div id="telegram-login-container" style={{ display: 'none' }} />
      </div>
    </div>
  )
}
