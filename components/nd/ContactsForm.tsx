'use client'

import { useState } from 'react'

interface Props {
  defaultName?: string
  defaultContacts?: string
  onSave: (name: string, contacts: string) => Promise<void>
  onClose: () => void
}

export default function ContactsForm({ defaultName = '', defaultContacts = '', onSave, onClose }: Props) {
  const [name, setName] = useState(defaultName)
  const [contacts, setContacts] = useState(defaultContacts)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Введите имя'); return }
    setLoading(true)
    setError('')
    try {
      await onSave(name.trim(), contacts.trim())
      onClose()
    } catch {
      setError('Что-то пошло не так, попробуйте снова')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '0.6rem 0.75rem',
    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
    fontSize: '0.875rem',
    color: '#111',
    background: '#fff',
    border: '1px solid #E5E5E5',
    borderBottom: '2px solid #111',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: '1rem',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
    fontSize: '0.6rem',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: '#666',
    marginBottom: '0.4rem',
  }

  return (
    <div
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
          background: '#fff',
          width: '100%',
          maxWidth: '400px',
          padding: '2.5rem 2rem 2rem',
          border: '2px solid #111',
        }}
      >
        <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#999', margin: '0 0 0.75rem' }}>
          Книжный клуб
        </p>
        <h2 style={{ fontFamily: 'var(--nd-serif), Georgia, serif', fontWeight: 700, fontSize: '1.4rem', color: '#111', margin: '0 0 0.25rem', letterSpacing: '-0.02em' }}>
          {defaultName ? 'Редактировать профиль' : 'Расскажите о себе'}
        </h2>
        <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.8rem', color: '#666', margin: '0 0 1.5rem' }}>
          {defaultName ? 'Обновите ваши данные' : 'Чтобы организатор знал, с кем связаться'}
        </p>

        <div style={{ borderTop: '1px solid #111', marginBottom: '1.5rem' }} />

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="nd-name" style={labelStyle}>Имя</label>
          <input
            id="nd-name"
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Как вас зовут"
            style={inputStyle}
          />

          <label htmlFor="nd-contacts" style={labelStyle}>Telegram</label>
          <input
            id="nd-contacts"
            type="text"
            value={contacts}
            onChange={e => setContacts(e.target.value)}
            placeholder="@username"
            style={inputStyle}
          />

          {error && (
            <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.8rem', color: '#c00', marginBottom: '1rem' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              display: 'block',
              width: '100%',
              padding: '0.7rem 1rem',
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              cursor: loading ? 'default' : 'pointer',
              border: '1px solid #111',
              background: loading ? '#E5E5E5' : '#111',
              color: loading ? '#999' : '#fff',
              transition: 'background 0.15s',
            }}
          >
            {loading ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </form>
      </div>
    </div>
  )
}
