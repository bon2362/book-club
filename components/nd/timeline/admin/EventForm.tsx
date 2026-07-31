'use client'

import { useState } from 'react'
import type { HistoricalDate } from '@/lib/timeline'
import { assertEventDates, TimelineValidationError } from '@/lib/timeline/admin'
import HistoricalDateField from './HistoricalDateField'
import MarkdownField from './MarkdownField'
import {
  SANS,
  SERIF,
  type AdminEventRow,
  type AdminEventType,
  type EventFormValue,
  buttonStyle,
  errorStyle,
  eventRowToForm,
  fieldRowStyle,
  inputStyle,
  microLabelStyle,
  readError,
  selectStyle,
} from './shared'

/** Чем заканчивается событие: ничем (точка), датой или признаком «продолжается». */
type EndMode = 'none' | 'date' | 'ongoing'

interface Props {
  editing: AdminEventRow | null
  types: AdminEventType[]
  onSaved: () => void
  onCancel: () => void
}

function initialValue(editing: AdminEventRow | null, types: AdminEventType[]): EventFormValue {
  if (editing) return eventRowToForm(editing)
  return {
    title: '',
    eventTypeId: types[0]?.id ?? '',
    start: { year: 1900, era: 'CE' },
    end: null,
    ongoing: false,
    description: '',
    imageUrl: '',
    imageCaption: '',
  }
}

function initialEndMode(value: EventFormValue): EndMode {
  if (value.ongoing) return 'ongoing'
  return value.end ? 'date' : 'none'
}

export default function EventForm({ editing, types, onSaved, onCancel }: Props) {
  const [value, setValue] = useState<EventFormValue>(() => initialValue(editing, types))
  const [endMode, setEndMode] = useState<EndMode>(() => initialEndMode(initialValue(editing, types)))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function patch(next: Partial<EventFormValue>) {
    setValue(prev => ({ ...prev, ...next }))
  }

  function changeEndMode(mode: EndMode) {
    setEndMode(mode)
    if (mode === 'none') patch({ end: null, ongoing: false })
    if (mode === 'ongoing') patch({ end: null, ongoing: true })
    if (mode === 'date') {
      patch({ ongoing: false, end: value.end ?? { year: value.start.year, era: value.start.era } })
    }
  }

  function payload() {
    return {
      title: value.title,
      eventTypeId: value.eventTypeId,
      start: {
        year: value.start.year,
        era: value.start.era,
        month: value.start.month ?? null,
        day: value.start.day ?? null,
      },
      end: value.end
        ? {
            year: value.end.year,
            era: value.end.era,
            month: value.end.month ?? null,
            day: value.end.day ?? null,
          }
        : null,
      ongoing: value.ongoing,
      description: value.description,
      imageUrl: value.imageUrl,
      imageCaption: value.imageCaption,
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!value.title.trim()) { setError('Название обязательно'); return }
    if (!value.eventTypeId) { setError('Выберите тип события'); return }

    // Те же проверки, что и на маршруте: отвечать до отправки честнее, чем
    // ждать ответа сервера.
    try {
      assertEventDates({ start: value.start, end: value.end, ongoing: value.ongoing })
    } catch (err) {
      setError(err instanceof TimelineValidationError ? err.message : 'Даты заданы неверно')
      return
    }

    setBusy(true)
    try {
      const res = await fetch(
        editing ? `/api/admin/timeline/events/${editing.id}` : '/api/admin/timeline/events',
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
      setError('Не удалось сохранить событие')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!editing) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/timeline/events/${editing.id}`, { method: 'DELETE' })
      const message = await readError(res)
      if (message) { setError(message); return }
      onSaved()
    } catch {
      setError('Не удалось удалить событие')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} data-testid="timeline-event-form" style={{ fontFamily: SANS }}>
      <h3 style={{ fontFamily: SERIF, fontSize: '1.05rem', color: 'var(--text)', margin: '0 0 1rem' }}>
        {editing ? 'Правка события' : 'Новое событие'}
      </h3>

      <div style={fieldRowStyle}>
        <label>
          <span style={microLabelStyle}>Название</span>
          <input
            value={value.title}
            onChange={event => patch({ title: event.target.value })}
            data-testid="event-title"
            aria-label="Название события"
            style={inputStyle}
          />
        </label>
        <label>
          <span style={microLabelStyle}>Тип</span>
          <select
            value={value.eventTypeId}
            onChange={event => patch({ eventTypeId: event.target.value })}
            data-testid="event-type-select"
            aria-label="Тип события"
            style={selectStyle}
          >
            <option value="">— выберите тип —</option>
            {types.map(type => (
              <option key={type.id} value={type.id}>{type.icon} {type.title}</option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <HistoricalDateField
          label="Начало"
          value={value.start}
          onChange={(start: HistoricalDate) => patch({ start })}
          testId="event-start"
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <span style={microLabelStyle}>Окончание</span>
        <select
          value={endMode}
          onChange={event => changeEndMode(event.target.value as EndMode)}
          data-testid="event-end-mode"
          aria-label="Окончание события"
          style={{ ...selectStyle, maxWidth: '20rem' }}
        >
          <option value="none">Нет — событие-точка</option>
          <option value="date">Задать дату окончания</option>
          <option value="ongoing">Продолжается</option>
        </select>
      </div>

      {endMode === 'date' && value.end && (
        <div style={{ marginBottom: '1rem' }}>
          <HistoricalDateField
            label="Окончание"
            value={value.end}
            onChange={(end: HistoricalDate) => patch({ end })}
            testId="event-end"
          />
        </div>
      )}

      <MarkdownField
        label="Описание"
        value={value.description}
        onChange={description => patch({ description })}
        testId="event-description"
      />

      <div style={fieldRowStyle}>
        <label>
          <span style={microLabelStyle}>Адрес картинки</span>
          <input
            value={value.imageUrl}
            onChange={event => patch({ imageUrl: event.target.value })}
            placeholder="https://…"
            data-testid="event-image-url"
            aria-label="Адрес картинки события"
            style={inputStyle}
          />
        </label>
        <label>
          <span style={microLabelStyle}>Подпись к картинке</span>
          <input
            value={value.imageCaption}
            onChange={event => patch({ imageCaption: event.target.value })}
            data-testid="event-image-caption"
            aria-label="Подпись к картинке события"
            style={inputStyle}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <button type="submit" disabled={busy} style={buttonStyle('primary')} data-testid="event-save">
          Сохранить
        </button>
        <button type="button" onClick={onCancel} style={buttonStyle()} data-testid="event-cancel">
          Отмена
        </button>
        {editing && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            style={{ ...buttonStyle('danger'), marginLeft: 'auto' }}
            data-testid="event-delete"
          >
            Удалить
          </button>
        )}
      </div>

      {error && <p style={errorStyle} role="alert" data-testid="event-error">{error}</p>}
    </form>
  )
}
