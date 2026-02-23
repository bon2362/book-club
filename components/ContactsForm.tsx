'use client'

import { useState } from 'react'

interface Props {
  initialName?: string
  initialContacts?: string
  onSave: (name: string, contacts: string) => Promise<void>
}

export default function ContactsForm({ initialName = '', initialContacts = '', onSave }: Props) {
  const [name, setName] = useState(initialName)
  const [contacts, setContacts] = useState(initialContacts)
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
    color: 'var(--text-secondary)',
    marginBottom: '0.4rem',
  }

  const inputBaseStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    fontFamily: "'Georgia', serif",
    fontSize: '0.9rem',
    color: 'var(--text)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderBottom: '2px solid var(--accent)',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s, background 0.15s',
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.background = 'var(--bg-input-focus)'
    e.currentTarget.style.borderColor = 'var(--accent)'
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.background = 'var(--bg-input)'
    e.currentTarget.style.borderColor = 'var(--border)'
    e.currentTarget.style.borderBottomColor = 'var(--accent)'
  }

  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--bg)',
        borderLeft: '4px solid var(--accent)',
        boxShadow: '4px 4px 0 rgba(181,69,27,0.13), 0 1px 4px var(--shadow-card)',
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
          borderColor: 'transparent var(--accent) transparent transparent',
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
          color: 'var(--text)',
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
            color: 'var(--text-muted)',
            letterSpacing: '0.02em',
          }}
        >
          Оставьте ваш телеграм, чтобы записаться на совместное чтение
        </span>
        <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {/* Name field */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label htmlFor="contacts-name" style={fieldLabelStyle}>
            Имя <span style={{ color: 'var(--accent)' }}>*</span>
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

        {/* Telegram field */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="contacts-info" style={fieldLabelStyle}>
            Telegram <span style={{ color: 'var(--accent)' }}>*</span>
          </label>
          <input
            id="contacts-info"
            type="text"
            required
            value={contacts}
            onChange={e => setContacts(e.target.value)}
            placeholder="Укажите ваш Telegram. Впишите @username или ссылку вида t.me/..."
            style={{ ...inputBaseStyle, padding: '0.625rem 0.75rem' }}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>

        {/* Decorative rule before button */}
        <div
          style={{
            borderTop: '1px solid var(--border-subtle)',
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
            border: `2px solid ${loading ? 'var(--border)' : 'var(--success)'}`,
            background: loading ? 'var(--border-subtle)' : 'var(--success)',
            color: loading ? 'var(--text-muted)' : 'var(--bg)',
            transition: 'all 0.18s',
            textAlign: 'center',
          }}
          onMouseEnter={e => {
            if (!loading) {
              const btn = e.currentTarget as HTMLButtonElement
              btn.style.background = 'var(--success-hover)'
              btn.style.borderColor = 'var(--success-hover)'
            }
          }}
          onMouseLeave={e => {
            if (!loading) {
              const btn = e.currentTarget as HTMLButtonElement
              btn.style.background = 'var(--success)'
              btn.style.borderColor = 'var(--success)'
            }
          }}
        >
          {loading ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </form>
    </div>
  )
}
