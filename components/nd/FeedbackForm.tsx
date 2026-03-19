'use client'

import { useState, useEffect, useCallback } from 'react'
import type { UserSignup } from '@/lib/signups'

interface Props {
  isOpen: boolean
  onClose: () => void
  currentUser: UserSignup | null
  userEmail?: string
}

type FormStatus = 'idle' | 'submitting' | 'needs-email-confirm' | 'success' | 'error'

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.85rem',
  color: '#111',
  background: '#fff',
  borderTop: '1px solid #E5E5E5',
  borderRight: '1px solid #E5E5E5',
  borderLeft: '1px solid #E5E5E5',
  borderBottom: '2px solid #111',
  padding: '0.5rem 0.6rem',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#111',
  display: 'block',
  marginBottom: '0.3rem',
}

export default function FeedbackForm({ isOpen, onClose, currentUser, userEmail }: Props) {
  const [status, setStatus] = useState<FormStatus>('idle')
  const [message, setMessage] = useState('')
  const [name, setName] = useState(currentUser?.name ?? '')
  const [email, setEmail] = useState(userEmail ?? '')

  const handleClose = useCallback(() => {
    if (status === 'submitting') return
    onClose()
  }, [status, onClose])

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleClose])

  // Reset form when closed; restore pre-fill when opened
  useEffect(() => {
    if (!isOpen) {
      setStatus('idle')
      setMessage('')
      setName(currentUser?.name ?? '')
      setEmail(userEmail ?? '')
    }
  }, [isOpen, currentUser, userEmail])

  async function doSend() {
    setStatus('submitting')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          name: name.trim() || undefined,
          email: email.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return

    if (!email.trim()) {
      if (status !== 'needs-email-confirm') {
        setStatus('needs-email-confirm')
        return
      }
      // second click on Отправить while in needs-email-confirm → do NOT send
      return
    }

    doSend()
  }

  function handleEmailChange(value: string) {
    setEmail(value)
    if (status === 'needs-email-confirm') {
      setStatus('idle')
    }
  }

  function handleOverlay(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) handleClose()
  }

  if (!isOpen) return null

  const isDisabled = !message.trim() || status === 'submitting'

  return (
    <div
      onClick={handleOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-form-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          position: 'relative',
          background: '#fff',
          width: '100%',
          maxWidth: '480px',
          border: '2px solid #111',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
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

        <div style={{ padding: '2rem 2rem 1.5rem', borderBottom: '1px solid #E5E5E5' }}>
          <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#999', margin: '0 0 0.5rem' }}>
            Читательские круги
          </p>
          <h2
            id="feedback-form-title"
            style={{ fontFamily: 'var(--nd-serif), Georgia, serif', fontWeight: 700, fontSize: '1.4rem', color: '#111', margin: 0, letterSpacing: '-0.02em' }}
          >
            Написать автору проекта
          </h2>
        </div>

        {status === 'success' ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '1rem', color: '#2D6A4F', fontWeight: 600, margin: '0 0 0.5rem' }}>
              Спасибо!
            </p>
            <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.875rem', color: '#555', margin: 0 }}>
              Я прочитаю и отвечу.
            </p>
            <button
              onClick={onClose}
              style={{
                marginTop: '1.5rem',
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#111',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid #111',
                cursor: 'pointer',
                padding: '0 0 1px',
              }}
            >
              Закрыть
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem 2rem 1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label htmlFor="fb-message" style={labelStyle}>Сообщение</label>
                  <textarea
                    id="fb-message"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Вопрос, предложение или пожелание"
                    rows={4}
                    autoFocus
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>

                <div>
                  <label htmlFor="fb-name" style={labelStyle}>Имя</label>
                  <input
                    id="fb-name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Необязательно"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label htmlFor="fb-email" style={labelStyle}>Email</label>
                  <input
                    id="fb-email"
                    type="email"
                    value={email}
                    onChange={e => handleEmailChange(e.target.value)}
                    placeholder="Необязательно"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            <div style={{ padding: '1rem 2rem', borderTop: '1px solid #E5E5E5', background: '#fff' }}>
              {status === 'error' && (
                <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.72rem', color: '#C0603A', margin: '0 0 0.75rem' }}>
                  Не удалось отправить. Попробуйте ещё раз.
                </p>
              )}
              <button
                type="submit"
                disabled={isDisabled}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  cursor: isDisabled ? 'default' : 'pointer',
                  border: '1px solid #111',
                  background: isDisabled ? 'transparent' : '#111',
                  color: isDisabled ? '#999' : '#fff',
                  borderColor: isDisabled ? '#C8C8C8' : '#111',
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                }}
              >
                {status === 'submitting' ? 'Отправляем…' : 'Отправить'}
              </button>
              {status === 'needs-email-confirm' && (
                <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.72rem', color: '#888', margin: '0.5rem 0 0', textAlign: 'center' }}>
                  Без email я не смогу ответить.{' '}
                  <button
                    type="button"
                    onClick={doSend}
                    style={{
                      fontFamily: 'inherit',
                      fontSize: 'inherit',
                      color: '#111',
                      background: 'none',
                      border: 'none',
                      borderBottom: '1px solid #111',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Отправить всё равно
                  </button>
                </p>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
