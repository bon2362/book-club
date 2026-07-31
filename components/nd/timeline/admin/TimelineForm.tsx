'use client'

import { useState } from 'react'
import MarkdownField from './MarkdownField'
import {
  SANS,
  SERIF,
  type AdminTimelineDetail,
  buttonStyle,
  errorStyle,
  inputStyle,
  microLabelStyle,
  readError,
} from './shared'

/**
 * Название, адрес и описание ленты.
 *
 * Под полем адреса показана итоговая ссылка целиком: адрес — это то, чем
 * владелец делится в чате, и увидеть результат до сохранения важнее, чем
 * сэкономить строку.
 */

interface Props {
  editing: AdminTimelineDetail | null
  onSaved: () => void
  onCancel: () => void
}

export default function TimelineForm({ editing, onSaved, onCancel }: Props) {
  const [title, setTitle] = useState(editing?.title ?? '')
  const [slug, setSlug] = useState(editing?.slug ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!title.trim()) { setError('Название обязательно'); return }
    if (!slug.trim()) { setError('Адрес обязателен'); return }

    setBusy(true)
    try {
      const res = await fetch(
        editing ? `/api/admin/timeline/timelines/${editing.id}` : '/api/admin/timeline/timelines',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, slug, description }),
        },
      )
      const message = await readError(res)
      if (message) { setError(message); return }
      onSaved()
    } catch {
      setError('Не удалось сохранить ленту')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} data-testid="timeline-form" style={{ fontFamily: SANS }}>
      <h3 style={{ fontFamily: SERIF, fontSize: '1.05rem', color: 'var(--text)', margin: '0 0 1rem' }}>
        {editing ? 'Правка ленты' : 'Новая лента'}
      </h3>

      <div style={{ marginBottom: '1rem' }}>
        <label>
          <span style={microLabelStyle}>Название</span>
          <input
            value={title}
            onChange={event => setTitle(event.target.value)}
            data-testid="timeline-title"
            aria-label="Название ленты"
            style={inputStyle}
          />
        </label>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label>
          <span style={microLabelStyle}>Адрес</span>
          <input
            value={slug}
            onChange={event => setSlug(event.target.value)}
            placeholder="moya-lenta"
            data-testid="timeline-slug"
            aria-label="Адрес ленты"
            style={inputStyle}
          />
        </label>
        <p
          data-testid="timeline-slug-preview"
          style={{
            fontFamily: SANS,
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            margin: '0.35rem 0 0',
          }}
        >
          Ссылка: /timeline/{slug || '…'}
        </p>
      </div>

      <MarkdownField
        label="Описание"
        value={description}
        onChange={setDescription}
        testId="timeline-description"
      />

      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <button type="submit" disabled={busy} style={buttonStyle('primary')} data-testid="timeline-form-save">
          Сохранить
        </button>
        <button type="button" onClick={onCancel} style={buttonStyle()} data-testid="timeline-form-cancel">
          Отмена
        </button>
      </div>

      {error && <p style={errorStyle} role="alert" data-testid="timeline-form-error">{error}</p>}
    </form>
  )
}
