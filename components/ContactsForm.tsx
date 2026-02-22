'use client'

import { useState } from 'react'

interface Props {
  initialName?: string
  onSave: (name: string, contacts: string) => Promise<void>
}

export default function ContactsForm({ initialName = '', onSave }: Props) {
  const [name, setName] = useState(initialName)
  const [contacts, setContacts] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim() || !contacts.trim()) return
    setLoading(true)
    try {
      await onSave(name.trim(), contacts.trim())
    } finally {
      setLoading(false)
    }
  }

  const fieldLabelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: "'Georgia', serif",
    fontSize: '0.675rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#5C4A3A',
    marginBottom: '0.4rem',
  }

  const inputBaseStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    fontFamily: "'Georgia', serif",
    fontSize: '0.9rem',
    color: '#1A1714',
    background: '#FDFAF5',
    border: '1px solid #D4C4B0',
    borderBottom: '2px solid #B5451B',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.background = '#FFFFFF'
    e.currentTarget.style.borderColor = '#B5451B'
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.background = '#FDFAF5'
    e.currentTarget.style.borderColor = '#D4C4B0'
    e.currentTarget.style.borderBottomColor = '#B5451B'
  }

  return (
    <div
      style={{
        position: 'relative',
        background: '#F9F5EE',
        borderLeft: '4px solid #B5451B',
        boxShadow: '4px 4px 0 #B5451B22, 0 1px 4px rgba(0,0,0,0.06)',
        padding: '2rem 2rem 1.75rem',
        fontFamily: "'Playfair Display', 'Georgia', 'Times New Roman', serif",
        overflow: 'hidden',
        maxWidth: '480px',
        width: '100%',
      }}
    >
      {/* Decorative corner mark */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 0,
          height: 0,
          borderStyle: 'solid',
          borderWidth: '0 32px 32px 0',
          borderColor: 'transparent #B5451B transparent transparent',
          opacity: 0.18,
        }}
      />

      {/* Heading */}
      <h2
        style={{
          fontFamily: "'Playfair Display', 'Georgia', serif",
          fontWeight: 700,
          fontSize: '1.375rem',
          letterSpacing: '-0.02em',
          lineHeight: 1.2,
          color: '#1A1714',
          margin: '0 0 0.3rem 0',
        }}
      >
        Ваши данные
      </h2>

      {/* Subtitle rule */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          margin: '0.625rem 0 1.75rem 0',
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
          чтобы мы знали, как с вами связаться
        </span>
        <div style={{ flex: 1, height: '1px', background: '#E2D8CC' }} />
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {/* Name field */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label htmlFor="contacts-name" style={fieldLabelStyle}>
            Имя <span style={{ color: '#B5451B' }}>*</span>
          </label>
          <input
            id="contacts-name"
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ваше имя"
            style={{ ...inputBaseStyle, padding: '0.625rem 0.75rem' }}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>

        {/* Contacts field */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="contacts-info" style={fieldLabelStyle}>
            Контакты <span style={{ color: '#B5451B' }}>*</span>
          </label>
          <textarea
            id="contacts-info"
            required
            value={contacts}
            onChange={e => setContacts(e.target.value)}
            placeholder="Telegram @username, телефон, email — любой удобный способ"
            rows={3}
            style={{
              ...inputBaseStyle,
              padding: '0.625rem 0.75rem',
              resize: 'vertical',
              lineHeight: 1.55,
            }}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
          {/* Hint */}
          <p
            style={{
              fontFamily: "'Georgia', serif",
              fontStyle: 'italic',
              fontSize: '0.7rem',
              color: '#8C7B6B',
              margin: '0.35rem 0 0 0',
              letterSpacing: '0.01em',
            }}
          >
            Мы используем контакты только для организации встреч клуба
          </p>
        </div>

        {/* Decorative rule before button */}
        <div
          style={{
            borderTop: '1px solid #E2D8CC',
            marginBottom: '1.25rem',
          }}
        />

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading}
          style={{
            display: 'block',
            width: '100%',
            padding: '0.75rem 1rem',
            fontFamily: "'Playfair Display', 'Georgia', serif",
            fontWeight: 600,
            fontSize: '0.9rem',
            letterSpacing: '0.04em',
            cursor: loading ? 'default' : 'pointer',
            border: `2px solid ${loading ? '#D4C4B0' : '#2D6A4F'}`,
            background: loading ? '#E2D8CC' : '#2D6A4F',
            color: loading ? '#8C7B6B' : '#F9F5EE',
            transition: 'all 0.18s',
            textAlign: 'center',
          }}
          onMouseEnter={e => {
            if (!loading) {
              const btn = e.currentTarget as HTMLButtonElement
              btn.style.background = '#1E4D39'
              btn.style.borderColor = '#1E4D39'
            }
          }}
          onMouseLeave={e => {
            if (!loading) {
              const btn = e.currentTarget as HTMLButtonElement
              btn.style.background = '#2D6A4F'
              btn.style.borderColor = '#2D6A4F'
            }
          }}
        >
          {loading ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </form>
    </div>
  )
}
