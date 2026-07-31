'use client'

import { useState } from 'react'
import { DEFAULT_TIMELINE_COLOR, TIMELINE_PALETTE } from './palette'
import {
  SANS,
  SERIF,
  type AdminEventType,
  buttonStyle,
  errorStyle,
  fieldRowStyle,
  inputStyle,
  microLabelStyle,
  readError,
} from './shared'

interface Props {
  /** null — создание нового типа. */
  editing: AdminEventType | null
  onSaved: () => void
  onCancel: () => void
}

export default function EventTypeForm({ editing, onSaved, onCancel }: Props) {
  const [title, setTitle] = useState(editing?.title ?? '')
  const [color, setColor] = useState(editing?.color ?? DEFAULT_TIMELINE_COLOR)
  const [icon, setIcon] = useState(editing?.icon ?? '★')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        editing ? `/api/admin/timeline/event-types/${editing.id}` : '/api/admin/timeline/event-types',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, color, icon }),
        },
      )
      const message = await readError(res)
      if (message) { setError(message); return }
      onSaved()
    } catch {
      setError('Не удалось сохранить тип события')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!editing) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/timeline/event-types/${editing.id}`, { method: 'DELETE' })
      const message = await readError(res)
      if (message) { setError(message); return }
      onSaved()
    } catch {
      setError('Не удалось удалить тип события')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} data-testid="timeline-event-type-form" style={{ fontFamily: SANS }}>
      <h3 style={{ fontFamily: SERIF, fontSize: '1.05rem', color: 'var(--text)', margin: '0 0 1rem' }}>
        {editing ? 'Правка типа события' : 'Новый тип события'}
      </h3>

      <div style={fieldRowStyle}>
        <label>
          <span style={microLabelStyle}>Название</span>
          <input
            value={title}
            onChange={event => setTitle(event.target.value)}
            data-testid="event-type-title"
            aria-label="Название типа"
            style={inputStyle}
          />
        </label>
        <label>
          <span style={microLabelStyle}>Иконка (эмодзи)</span>
          <input
            value={icon}
            onChange={event => setIcon(event.target.value)}
            maxLength={8}
            data-testid="event-type-icon"
            aria-label="Иконка типа"
            style={inputStyle}
          />
        </label>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <span style={microLabelStyle}>Цвет</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }} data-testid="event-type-palette">
          {TIMELINE_PALETTE.map(option => (
            <button
              key={option.value}
              type="button"
              title={option.label}
              aria-label={option.label}
              aria-pressed={color === option.value}
              onClick={() => setColor(option.value)}
              data-testid={`event-type-color-${option.value.slice(1)}`}
              style={{
                width: '1.75rem',
                height: '1.75rem',
                background: option.value,
                border: color === option.value ? '2px solid var(--text)' : '1px solid var(--border)',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <button type="submit" disabled={busy} style={buttonStyle('primary')} data-testid="event-type-save">
          Сохранить
        </button>
        <button type="button" onClick={onCancel} style={buttonStyle()} data-testid="event-type-cancel">
          Отмена
        </button>
        {editing && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            style={{ ...buttonStyle('danger'), marginLeft: 'auto' }}
            data-testid="event-type-delete"
          >
            Удалить
          </button>
        )}
      </div>

      {error && (
        <p style={errorStyle} role="alert" data-testid="event-type-error">{error}</p>
      )}
    </form>
  )
}
