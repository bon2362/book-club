'use client'

import { useEffect, useState, type FormEvent } from 'react'
import type { HistoricalDate } from '@/lib/timeline'
import {
  TimelineValidationError,
  assertEpochDates,
  assertEventDates,
} from '@/lib/timeline/admin'
import type { TimelineEpochView, TimelineEventView } from '@/lib/timeline/view-model'
import HistoricalDateField from './admin/HistoricalDateField'
import { TIMELINE_EPOCH_PALETTE } from './admin/palette'
import {
  buttonStyle,
  errorStyle,
  inputStyle,
  microLabelStyle,
  readError,
  textareaStyle,
  type AdminEventType,
} from './admin/shared'

export type EditableTimelineItem =
  | { kind: 'event'; item: TimelineEventView }
  | { kind: 'epoch'; item: TimelineEpochView }

interface Props {
  timelineId: string
  selected: EditableTimelineItem
  onCancel: () => void
  onChanged: () => void
}

function apiDate(value: HistoricalDate) {
  return {
    year: value.year,
    era: value.era,
    month: value.month ?? null,
    day: value.day ?? null,
  }
}

async function request(url: string, init: RequestInit): Promise<string | null> {
  try {
    return readError(await fetch(url, init))
  } catch {
    return 'Не удалось связаться с сервером'
  }
}

export default function TimelineInlineEditor({ timelineId, selected, onCancel, onChanged }: Props) {
  const { item } = selected
  const event = selected.kind === 'event' ? selected.item : null
  const epoch = selected.kind === 'epoch' ? selected.item : null
  const [title, setTitle] = useState(item.title)
  const [start, setStart] = useState(item.start)
  const [end, setEnd] = useState<HistoricalDate | null>(item.end ?? null)
  const [ongoing, setOngoing] = useState(event?.ongoing ?? false)
  const [eventTypeId, setEventTypeId] = useState(event?.typeId ?? '')
  const [types, setTypes] = useState<AdminEventType[]>(event ? [{
    id: event.typeId,
    title: event.typeTitle,
    color: event.color,
    icon: event.icon,
    usageCount: 0,
  }] : [])
  const [description, setDescription] = useState(item.description)
  const [note, setNote] = useState(item.note)
  const [color, setColor] = useState(epoch?.color ?? TIMELINE_EPOCH_PALETTE[0].value)
  const [visible] = useState(item.visible)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!event) return
    void fetch('/api/admin/timeline/event-types')
      .then((response) => response.json())
      .then((payload: { data?: unknown }) => {
        if (Array.isArray(payload.data)) setTypes(payload.data as AdminEventType[])
      })
      .catch(() => {})
  }, [event])

  const membershipUrl = selected.kind === 'event'
    ? `/api/admin/timeline/timelines/${timelineId}/events/${item.id}`
    : `/api/admin/timeline/timelines/${timelineId}/epochs/${item.id}`
  const itemUrl = selected.kind === 'event'
    ? `/api/admin/timeline/events/${item.id}`
    : `/api/admin/timeline/epochs/${item.id}`

  async function save(submitEvent: FormEvent) {
    submitEvent.preventDefault()
    setError(null)
    if (!title.trim()) {
      setError('Название обязательно')
      return
    }

    try {
      if (selected.kind === 'event') assertEventDates({ start, end, ongoing })
      else assertEpochDates({ start, end })
    } catch (validationError) {
      setError(validationError instanceof TimelineValidationError
        ? validationError.message
        : 'Даты заданы неверно')
      return
    }

    setBusy(true)
    const commonBody = selected.kind === 'event'
      ? {
          title,
          eventTypeId,
          start: apiDate(start),
          end: end ? apiDate(end) : null,
          ongoing,
          description,
          imageUrl: item.imageUrl,
          imageCaption: item.imageCaption,
        }
      : {
          title,
          start: apiDate(start),
          end: end ? apiDate(end) : null,
          description,
          imageUrl: item.imageUrl,
          imageCaption: item.imageCaption,
        }
    const commonError = await request(itemUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commonBody),
    })
    if (commonError) {
      setError(commonError)
      setBusy(false)
      return
    }

    const membershipBody = selected.kind === 'event'
      ? { note, visible }
      : { note, color, visible, pinnedLane: epoch?.pinnedLane ?? null }
    const membershipError = await request(membershipUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(membershipBody),
    })
    setBusy(false)
    if (membershipError) {
      setError(membershipError)
      return
    }
    onChanged()
  }

  async function toggleVisibility() {
    setBusy(true)
    setError(null)
    const nextVisible = !item.visible
    const init = selected.kind === 'event'
      ? { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visible: nextVisible }) }
      : {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note, color, visible: nextVisible, pinnedLane: epoch?.pinnedLane ?? null }),
        }
    const message = await request(membershipUrl, init)
    setBusy(false)
    if (message) setError(message)
    else onChanged()
  }

  async function remove(url: string) {
    setBusy(true)
    setError(null)
    const message = await request(url, { method: 'DELETE' })
    setBusy(false)
    if (message) setError(message)
    else onChanged()
  }

  return (
    <form
      onSubmit={save}
      data-testid="timeline-inline-editor"
      style={{
        padding: '0.85rem 1rem 1rem',
        background: 'var(--surface-soft)',
        boxShadow: 'inset 3px 0 0 var(--accent)',
        fontFamily: 'var(--nd-sans)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.75rem' }}>
        <span style={{ ...microLabelStyle, margin: 0 }}>{selected.kind === 'event' ? 'Событие' : 'Эпоха'}</span>
        <button
          type="button"
          onClick={onCancel}
          style={{
            ...buttonStyle(),
            paddingLeft: '0.9rem',
            border: 'none',
            boxShadow: 'inset 1px 0 0 var(--hair)',
          }}
        >
          Отмена
        </button>
      </div>

      <label>
        <span style={microLabelStyle}>Название</span>
        <input
          value={title}
          onChange={(changeEvent) => setTitle(changeEvent.target.value)}
          aria-label={selected.kind === 'event' ? 'Название события' : 'Название эпохи'}
          style={{ ...inputStyle, font: '700 1.45rem/1.2 var(--nd-serif)' }}
        />
      </label>

      {selected.kind === 'event' ? (
        <div style={{ marginTop: '0.7rem' }}>
          <span style={microLabelStyle}>Тип</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
            {types.map((type) => (
              <button
                key={type.id}
                type="button"
                aria-label={type.title}
                aria-pressed={eventTypeId === type.id}
                onClick={() => setEventTypeId(type.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.25rem 0.45rem',
                  border: eventTypeId === type.id ? '1px solid var(--text)' : '1px solid var(--hair)',
                  background: 'transparent',
                  color: 'var(--text-body)',
                  cursor: 'pointer',
                  font: '0.72rem/1 var(--nd-sans)',
                }}
              >
                <span aria-hidden="true" style={{ width: '8px', height: '8px', borderRadius: '50%', background: type.color }} />
                {type.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(19rem, 1fr))', gap: '0.7rem', marginTop: '0.75rem' }}>
        <HistoricalDateField label="Начало" value={start} onChange={setStart} testId="inline-start" />
        {end ? <HistoricalDateField label="Окончание" value={end} onChange={setEnd} testId="inline-end" /> : null}
      </div>

      {selected.kind === 'event' ? (
        <div style={{ display: 'flex', gap: '1rem', margin: '0.55rem 0' }}>
          <label style={{ fontSize: '0.75rem' }}>
            <input type="checkbox" checked={end !== null} onChange={(changeEvent) => {
              setEnd(changeEvent.target.checked ? { year: start.year, era: start.era } : null)
              if (changeEvent.target.checked) setOngoing(false)
            }} /> Дата окончания
          </label>
          <label style={{ fontSize: '0.75rem' }}>
            <input type="checkbox" checked={ongoing} onChange={(changeEvent) => {
              setOngoing(changeEvent.target.checked)
              if (changeEvent.target.checked) setEnd(null)
            }} /> Продолжается
          </label>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(13rem, 1fr)', gap: '0.8rem', marginTop: '0.75rem' }}>
        <label>
          <span style={microLabelStyle}>Описание</span>
          <textarea value={description} onChange={(changeEvent) => setDescription(changeEvent.target.value)} style={{ ...textareaStyle, minHeight: '5rem' }} />
        </label>
        <label>
          <span style={microLabelStyle}>Заметка · только эта лента</span>
          <textarea aria-label="Заметка для этой ленты" value={note} onChange={(changeEvent) => setNote(changeEvent.target.value)} style={{ ...textareaStyle, minHeight: '5rem' }} />
        </label>
      </div>

      {selected.kind === 'epoch' ? (
        <div style={{ marginTop: '0.7rem' }}>
          <span style={microLabelStyle}>Цвет полосы · только эта лента</span>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {TIMELINE_EPOCH_PALETTE.map((option) => (
              <button key={option.value} type="button" aria-label={option.label} aria-pressed={color === option.value} onClick={() => setColor(option.value)} style={{ width: '1.75rem', height: '1.75rem', background: option.value, border: color === option.value ? '2px solid var(--text)' : '1px solid var(--hair)', cursor: 'pointer' }} />
            ))}
          </div>
        </div>
      ) : null}

      <p style={{ margin: '0.7rem 0', color: 'var(--text-muted)', font: 'italic 0.68rem/1.4 var(--nd-sans)' }}>
        Название, даты, картинка и описание — общие для всех лент
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
        <button type="submit" disabled={busy} style={buttonStyle('primary')}>Сохранить</button>
        <button type="button" disabled={busy} onClick={() => void remove(membershipUrl)} style={buttonStyle()}>Открепить от ленты</button>
        <button type="button" disabled={busy} onClick={() => void toggleVisibility()} style={buttonStyle()}>{item.visible ? 'Скрыть на ленте' : 'Показать на ленте'}</button>
        <span aria-hidden="true" style={{ width: '1px', height: '1.4rem', background: 'var(--hair)' }} />
        {confirmDelete ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent)', fontSize: '0.75rem' }}>
            Удалить из общей базы?
            <button type="button" disabled={busy} onClick={() => void remove(itemUrl)} style={buttonStyle('danger')}>Да, удалить</button>
            <button type="button" onClick={() => setConfirmDelete(false)} style={buttonStyle()}>Нет</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} style={buttonStyle('danger')}>Удалить из базы</button>
        )}
      </div>
      {error ? <p role="alert" style={errorStyle}>{error}</p> : null}
    </form>
  )
}
