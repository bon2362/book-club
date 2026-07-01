'use client'

import { useEffect, useRef, useState } from 'react'
import { signIn } from 'next-auth/react'
import { track } from '@/lib/analytics'
import { readRememberedAuthProvider, type RememberedAuthProvider } from './auth-provider-memory'

declare global {
  interface Window {
    onTelegramAuth: (user: Record<string, string>) => void
  }
}

const BOT_NAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME
const REMEMBERED_PROVIDER_LABEL: Record<RememberedAuthProvider, string> = {
  telegram: 'Telegram',
  google: 'Google',
  email: 'почту',
}

interface Props {
  isOpen: boolean
  onClose: () => void
  callbackUrl?: string
}

export default function AuthModal({ isOpen, onClose, callbackUrl }: Props) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [email, setEmail] = useState('')
  const [magicState, setMagicState] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [showOther, setShowOther] = useState(false)
  const [tgState, setTgState] = useState<'idle' | 'waiting'>('idle')
  const tgTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [rememberedProvider, setRememberedProvider] = useState<RememberedAuthProvider | null>(null)

  // Bot-login: открываем бота с nonce и опрашиваем сервер, пока вебхук не привяжет вход.
  // Куку ставит ответ на наш poll — т.е. в ЭТОМ браузере (а не во встроенном браузере Telegram).
  function startTelegramBotLogin() {
    if (!BOT_NAME) return
    const nonce = crypto.randomUUID()
    window.open(`https://t.me/${BOT_NAME}?start=${nonce}`, '_blank')
    track('auth_attempt', { provider: 'telegram' })
    setTgState('waiting')
    const started = Date.now()
    if (tgTimer.current) clearInterval(tgTimer.current)
    tgTimer.current = setInterval(async () => {
      if (Date.now() - started > 120000) {
        if (tgTimer.current) clearInterval(tgTimer.current)
        setTgState('idle')
        return
      }
      try {
        const r = await fetch(`/api/auth/telegram/poll?nonce=${nonce}`)
        const d = await r.json()
        if (d.status === 'ok') {
          if (tgTimer.current) clearInterval(tgTimer.current)
          window.location.reload()
        }
      } catch { /* keep polling */ }
    }, 2000)
  }

  useEffect(() => () => { if (tgTimer.current) clearInterval(tgTimer.current) }, [])

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setMagicState('loading')
    track('auth_attempt', { provider: 'email' })
    try {
      const res = await signIn('resend', {
        email: email.trim(),
        redirect: false,
        ...(callbackUrl ? { callbackUrl } : {}),
      })
      if (res?.error) {
        setMagicState('error')
      } else {
        track('auth_email_link_sent')
        setMagicState('sent')
      }
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

  useEffect(() => {
    if (!isOpen) return

    const provider = readRememberedAuthProvider()
    setRememberedProvider(provider)
    setShowOther(provider === 'google' || provider === 'email')
  }, [isOpen])

  if (!isOpen) return null

  function renderRememberedBadge(style?: React.CSSProperties) {
    return (
      <span
        style={{
          position: 'absolute',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.3rem',
          zIndex: 2,
          background: 'var(--accent)',
          color: 'var(--bg)',
          fontFamily: 'var(--nd-sans), system-ui, sans-serif',
          fontSize: '0.5rem',
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: '0.09em',
          padding: '0.22rem 0.45rem',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          ...style,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 5,
            height: 5,
            flexShrink: 0,
            background: 'var(--bg)',
            borderRadius: '50%',
          }}
        />
        Последний вход
      </span>
    )
  }

  function handleOverlay(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Войти в круг"
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
          background: 'var(--bg-input)',
          width: '100%',
          maxWidth: '400px',
          padding: '2.5rem 2rem 2rem',
          border: '2px solid var(--border-strong)',
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
            color: 'var(--text-muted)',
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
            color: 'var(--text-muted)',
            margin: '0 0 0.75rem',
          }}
        >
          Читательские круги
        </p>

        <h2
          style={{
            fontFamily: 'var(--nd-serif), Georgia, serif',
            fontWeight: 700,
            fontSize: '1.5rem',
            color: 'var(--text)',
            margin: '0 0 0.25rem',
            letterSpacing: '-0.02em',
          }}
        >
          Войти в круг
        </h2>

        <p
          style={{
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            margin: rememberedProvider ? '0 0 0.85rem' : '0 0 1.75rem',
            lineHeight: 1.5,
          }}
        >
          войдите, чтобы записаться на книги
        </p>

        {rememberedProvider && (
          <p
            style={{
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.74rem',
              color: 'var(--text-secondary)',
              margin: '0 0 1.5rem',
              lineHeight: 1.5,
            }}
          >
            В прошлый раз вы входили через{' '}
            <b style={{ color: 'var(--accent)' }}>{REMEMBERED_PROVIDER_LABEL[rememberedProvider]}</b>
            {' '}— войдите так же, чтобы попасть в свой аккаунт.
          </p>
        )}

        <div style={{ borderTop: '1px solid var(--border-strong)', marginBottom: '1.5rem' }} />

        {/* Telegram — primary (bot deep-link) */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ position: 'relative' }}>
            {rememberedProvider === 'telegram' && renderRememberedBadge({ top: '-0.7rem', right: '-0.5rem' })}
            <button
              onClick={startTelegramBotLogin}
              disabled={tgState === 'waiting'}
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
                cursor: tgState === 'waiting' ? 'default' : 'pointer',
                border: '1px solid var(--border-strong)',
                background: 'var(--text)',
                color: 'var(--bg)',
                boxSizing: 'border-box',
                opacity: tgState === 'waiting' ? 0.7 : 1,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }} fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.09 14.06l-2.945-.917c-.64-.203-.658-.64.136-.954l11.57-4.46c.537-.194 1.006.131.843.492z"/>
              </svg>
              <span>{tgState === 'waiting' ? 'Ждём подтверждения…' : 'Войти через Telegram'}</span>
            </button>
          </div>

          {tgState === 'waiting' && (
            <p style={{
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.72rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
              margin: '0.6rem 0 0',
              textAlign: 'center',
            }}>
              Откройте бота, нажмите Start и вернитесь сюда — вход произойдёт автоматически.
            </p>
          )}

        </div>

        {/* Other methods toggle */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => setShowOther(v => !v)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
              textDecoration: 'underline',
              textDecorationColor: 'var(--border)',
              textUnderlineOffset: '3px',
              padding: 0,
            }}
          >
            {showOther ? 'Скрыть' : 'Войти другим способом'}
          </button>
        </div>

        {/* Google + magic link — secondary */}
        {showOther && (
          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ position: 'relative' }}>
              {rememberedProvider === 'google' && renderRememberedBadge({ top: '-0.65rem', right: '0.75rem' })}
              <button
                onClick={() => {
                  track('auth_attempt', { provider: 'google' })
                  signIn('google', callbackUrl ? { callbackUrl } : undefined)
                }}
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
                  border: '1px solid var(--border-strong)',
                  background: 'var(--text)',
                  color: 'var(--bg)',
                  transition: 'background 0.15s',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="currentColor" opacity="0.85" />
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="currentColor" opacity="0.7" />
                  <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="currentColor" opacity="0.6" />
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="currentColor" opacity="0.55" />
                </svg>
                <span>Войти через Google</span>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>или</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            {magicState === 'sent' ? (
              <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0, textAlign: 'center' }}>
                Проверьте почту — мы отправили ссылку для входа на <strong>{email}</strong>
              </p>
            ) : (
              <form onSubmit={handleMagicLink} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ position: 'relative' }}>
                  {rememberedProvider === 'email' && renderRememberedBadge({ top: '-0.65rem', right: '0.5rem' })}
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="ваш@email.com"
                    required
                    style={{
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '1rem',
                      color: 'var(--text)',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      borderBottom: '2px solid var(--border-strong)',
                      padding: '0.6rem 0.75rem',
                      outline: 'none',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                {magicState === 'error' && (
                  <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.75rem', color: 'var(--accent)', margin: 0 }}>
                    Не удалось отправить письмо. Попробуйте ещё раз.
                  </p>
                )}
                {email.trim() && (
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
                      border: '1px solid var(--border-strong)',
                      background: 'transparent',
                      color: magicState === 'loading' ? 'var(--text-muted)' : '#111',
                      borderColor: magicState === 'loading' ? '#C8C8C8' : '#111',
                      transition: 'color 0.15s, border-color 0.15s',
                    }}
                  >
                    {magicState === 'loading' ? 'Отправляем…' : 'Получить ссылку на почту'}
                  </button>
                )}
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
