'use client'

import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { coordinateToHistoricalDate, type HistoricalDate, type VisibleRange } from '@/lib/timeline'
import { TimelineValidationError, assertEpochDates, assertEventDates } from '@/lib/timeline/admin'
import HistoricalDateField from './admin/HistoricalDateField'
import { DEFAULT_TIMELINE_EPOCH_COLOR } from './admin/palette'
import { buttonStyle, errorStyle, inputStyle, microLabelStyle, readError, textareaStyle, type AdminEventType } from './admin/shared'

interface Props {
  kind: 'event' | 'epoch'
  timelineId: string
  range: VisibleRange
  onCancel: () => void
  onCreated: (kind: 'event' | 'epoch', id: string) => void
}

function apiDate(value: HistoricalDate) {
  return { year: value.year, era: value.era, month: value.month ?? null, day: value.day ?? null }
}

export default function TimelineCreateForm({ kind, timelineId, range, onCancel, onCreated }: Props) {
  const middle = coordinateToHistoricalDate(Math.round((range.start + range.end) / 2))
  const epochEnd = coordinateToHistoricalDate(Math.round((range.start + range.end) / 2) + 50)
  const [title, setTitle] = useState('')
  const [start, setStart] = useState<HistoricalDate>(middle)
  const [end, setEnd] = useState<HistoricalDate | null>(kind === 'epoch' ? epochEnd : null)
  const [ongoing, setOngoing] = useState(false)
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageCaption, setImageCaption] = useState('')
  const [types, setTypes] = useState<AdminEventType[]>([])
  const [eventTypeId, setEventTypeId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (kind !== 'event') return
    void fetch('/api/admin/timeline/event-types')
      .then((response) => response.json())
      .then((payload: { data?: unknown }) => {
        if (!Array.isArray(payload.data)) return
        const next = payload.data as AdminEventType[]
        setTypes(next)
        setEventTypeId((current) => current || next[0]?.id || '')
      })
      .catch(() => setError('Не удалось загрузить типы событий'))
  }, [kind])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!title.trim()) { setError('Название обязательно'); return }
    if (kind === 'event' && !eventTypeId) { setError('Выберите тип события'); return }
    try {
      if (kind === 'event') assertEventDates({ start, end, ongoing })
      else assertEpochDates({ start, end })
    } catch (validationError) {
      setError(validationError instanceof TimelineValidationError ? validationError.message : 'Даты заданы неверно')
      return
    }

    setBusy(true)
    const body = kind === 'event'
      ? { title, eventTypeId, start: apiDate(start), end: end ? apiDate(end) : null, ongoing, description, imageUrl: imageUrl || null, imageCaption: imageCaption || null }
      : { title, start: apiDate(start), end: end ? apiDate(end) : null, description, imageUrl: imageUrl || null, imageCaption: imageCaption || null }
    try {
      const createResponse = await fetch(`/api/admin/timeline/${kind === 'event' ? 'events' : 'epochs'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const createError = await readError(createResponse)
      if (createError) { setError(createError); return }
      const payload = await createResponse.json() as { data: { id: string } }
      const id = payload.data.id
      const membershipUrl = `/api/admin/timeline/timelines/${timelineId}/${kind === 'event' ? 'events' : 'epochs'}/${id}`
      const membership = kind === 'event'
        ? { note: '', visible: true }
        : { note: '', color: DEFAULT_TIMELINE_EPOCH_COLOR, visible: true, pinnedLane: null }
      const attachResponse = await fetch(membershipUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(membership) })
      const attachError = await readError(attachResponse)
      if (attachError) { setError(attachError); return }
      onCreated(kind, id)
    } catch {
      setError('Не удалось создать элемент')
    } finally {
      setBusy(false)
    }
  }

  function keyboard(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onCancel() }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      event.currentTarget.requestSubmit()
    }
  }

  return (
    <form onSubmit={submit} onKeyDown={keyboard} data-testid="timeline-create-form" style={{ padding: '0.85rem 1rem 1rem', background: 'var(--surface-soft)', boxShadow: 'inset 3px 0 0 var(--accent)', fontFamily: 'var(--nd-sans)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
        <span style={{ ...microLabelStyle, margin: 0 }}>{kind === 'event' ? 'Новое событие' : 'Новая эпоха'}</span>
        <button type="button" onClick={onCancel} style={{ ...buttonStyle(), border: 'none', boxShadow: 'inset 1px 0 0 var(--hair)' }}>Отмена</button>
      </div>
      <label style={{ display: 'block', marginTop: '0.65rem' }}>
        <span style={microLabelStyle}>Название</span>
        <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} aria-label={kind === 'event' ? 'Название нового события' : 'Название новой эпохи'} style={{ ...inputStyle, font: '700 1.45rem/1.2 var(--nd-serif)' }} />
      </label>
      {kind === 'event' ? (
        <div style={{ marginTop: '0.65rem' }}><span style={microLabelStyle}>Тип</span><div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>{types.map((type) => <button key={type.id} type="button" aria-label={type.title} aria-pressed={eventTypeId === type.id} onClick={() => setEventTypeId(type.id)} style={{ border: eventTypeId === type.id ? '1px solid var(--text)' : '1px solid var(--hair)', background: 'transparent', padding: '0.25rem 0.45rem', cursor: 'pointer' }}><span aria-hidden="true" style={{ display: 'inline-block', width: '8px', height: '8px', marginRight: '0.35rem', borderRadius: '50%', background: type.color }} />{type.title}</button>)}</div></div>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(19rem, 1fr))', gap: '0.7rem', marginTop: '0.7rem' }}>
        <HistoricalDateField label="Начало" value={start} onChange={setStart} testId="create-start" />
        {end ? <HistoricalDateField label="Окончание" value={end} onChange={setEnd} testId="create-end" /> : null}
      </div>
      {kind === 'event' ? <div style={{ display: 'flex', gap: '1rem', margin: '0.5rem 0' }}><label><input type="checkbox" checked={end !== null} onChange={(event) => { setEnd(event.target.checked ? start : null); if (event.target.checked) setOngoing(false) }} /> Дата окончания</label><label><input type="checkbox" checked={ongoing} onChange={(event) => { setOngoing(event.target.checked); if (event.target.checked) setEnd(null) }} /> Продолжается</label></div> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(13rem, 1fr)', gap: '0.8rem', marginTop: '0.7rem' }}>
        <label><span style={microLabelStyle}>Описание</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} style={{ ...textareaStyle, minHeight: '4rem' }} /></label>
        <div><span style={microLabelStyle}>Картинка · внешний адрес</span><div style={{ width: kind === 'event' ? '80px' : '140px', height: kind === 'event' ? '106px' : '94px', marginBottom: '0.4rem', background: 'var(--surface-soft)', boxShadow: 'inset 0 0 0 1px var(--hair)' }} /><input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} aria-label="Адрес картинки" placeholder="https://…" style={inputStyle} /><input value={imageCaption} onChange={(event) => setImageCaption(event.target.value)} aria-label="Подпись к картинке" placeholder="Подпись" style={{ ...inputStyle, marginTop: '0.35rem' }} /></div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.7rem' }}><button type="submit" disabled={busy} style={buttonStyle('primary')}>Создать</button><span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>⌘↵ — создать · Esc — отмена</span></div>
      {error ? <p role="alert" style={errorStyle}>{error}</p> : null}
    </form>
  )
}
