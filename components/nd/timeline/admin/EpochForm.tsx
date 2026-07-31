'use client'

import { useState } from 'react'
import type { HistoricalDate } from '@/lib/timeline'
import { assertEpochDates, TimelineValidationError } from '@/lib/timeline/admin'
import HistoricalDateField from './HistoricalDateField'
import MarkdownField from './MarkdownField'
import {
  SANS,
  SERIF,
  type AdminEpochRow,
  type EpochFormValue,
  buttonStyle,
  epochRowToForm,
  errorStyle,
  fieldRowStyle,
  inputStyle,
  microLabelStyle,
  readError,
} from './shared'

interface Props {
  editing: AdminEpochRow | null
  onSaved: () => void
  onCancel: () => void
}

function initialValue(editing: AdminEpochRow | null): EpochFormValue {
  if (editing) return epochRowToForm(editing)
  return {
    title: '',
    start: { year: 1900, era: 'CE' },
    end: { year: 1950, era: 'CE' },
    description: '',
    imageUrl: '',
    imageCaption: '',
  }
}

export default function EpochForm({ editing, onSaved, onCancel }: Props) {
  const [value, setValue] = useState<EpochFormValue>(() => initialValue(editing))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function patch(next: Partial<EpochFormValue>) {
    setValue(prev => ({ ...prev, ...next }))
  }

  function payload() {
    const date = (d: HistoricalDate) => ({
      year: d.year,
      era: d.era,
      month: d.month ?? null,
      day: d.day ?? null,
    })
    return {
      title: value.title,
      start: date(value.start),
      end: date(value.end),
      description: value.description,
      imageUrl: value.imageUrl,
      imageCaption: value.imageCaption,
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!value.title.trim()) { setError('Название обязательно'); return }

    // У эпохи конец обязателен — так стоит в базе.
    try {
      assertEpochDates({ start: value.start, end: value.end })
    } catch (err) {
      setError(err instanceof TimelineValidationError ? err.message : 'Даты заданы неверно')
      return
    }

    setBusy(true)
    try {
      const res = await fetch(
        editing ? `/api/admin/timeline/epochs/${editing.id}` : '/api/admin/timeline/epochs',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload()),
        },
      )
      const message = await readError(res)
      if (message) { setError(message); return }
      onSaved()
    } catch {
      setError('Не удалось сохранить эпоху')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!editing) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/timeline/epochs/${editing.id}`, { method: 'DELETE' })
      const message = await readError(res)
      if (message) { setError(message); return }
      onSaved()
    } catch {
      setError('Не удалось удалить эпоху')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} data-testid="timeline-epoch-form" style={{ fontFamily: SANS }}>
      <h3 style={{ fontFamily: SERIF, fontSize: '1.05rem', color: 'var(--text)', margin: '0 0 1rem' }}>
        {editing ? 'Правка эпохи' : 'Новая эпоха'}
      </h3>

      <div style={{ marginBottom: '1rem' }}>
        <label>
          <span style={microLabelStyle}>Название</span>
          <input
            value={value.title}
            onChange={event => patch({ title: event.target.value })}
            data-testid="epoch-title"
            aria-label="Название эпохи"
            style={inputStyle}
          />
        </label>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <HistoricalDateField
          label="Начало"
          value={value.start}
          onChange={start => patch({ start })}
          testId="epoch-start"
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <HistoricalDateField
          label="Окончание"
          value={value.end}
          onChange={end => patch({ end })}
          testId="epoch-end"
        />
      </div>

      <MarkdownField
        label="Описание"
        value={value.description}
        onChange={description => patch({ description })}
        testId="epoch-description"
      />

      <div style={fieldRowStyle}>
        <label>
          <span style={microLabelStyle}>Адрес картинки</span>
          <input
            value={value.imageUrl}
            onChange={event => patch({ imageUrl: event.target.value })}
            placeholder="https://…"
            data-testid="epoch-image-url"
            aria-label="Адрес картинки эпохи"
            style={inputStyle}
          />
        </label>
        <label>
          <span style={microLabelStyle}>Подпись к картинке</span>
          <input
            value={value.imageCaption}
            onChange={event => patch({ imageCaption: event.target.value })}
            data-testid="epoch-image-caption"
            aria-label="Подпись к картинке эпохи"
            style={inputStyle}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <button type="submit" disabled={busy} style={buttonStyle('primary')} data-testid="epoch-save">
          Сохранить
        </button>
        <button type="button" onClick={onCancel} style={buttonStyle()} data-testid="epoch-cancel">
          Отмена
        </button>
        {editing && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            style={{ ...buttonStyle('danger'), marginLeft: 'auto' }}
            data-testid="epoch-delete"
          >
            Удалить
          </button>
        )}
      </div>

      {error && <p style={errorStyle} role="alert" data-testid="epoch-error">{error}</p>}
    </form>
  )
}
