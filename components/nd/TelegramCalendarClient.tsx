'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CalendarGrid, { type CalendarColumn } from './CalendarGrid'
import { addInterval, normalize, removeInterval } from '@/lib/calendar/availability-intervals'
import { computeOverlap } from '@/lib/calendar/overlap'
import { addSlots, enumerateSlots, SLOT_MINUTES, type Interval } from '@/lib/calendar/slots'
import type { CalendarPublicState } from '@/lib/calendar/public-state'
import { addLocalDays, detectBrowserTimeZone, formatInZone, startOfLocalDay } from '@/lib/calendar/timezone'

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData?: string; ready?: () => void; requestFullscreen?: () => void } }
  }
}

const TIME_ZONES = ['Europe/Belgrade', 'Europe/Moscow', 'Europe/London', 'UTC']

export default function TelegramCalendarClient({ slug }: { slug: string }) {
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<CalendarPublicState | null>(null)
  const [timeZone, setTimeZone] = useState('UTC')
  const [viewerIntervals, setViewerIntervals] = useState<Interval[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [showFullDay, setShowFullDay] = useState(false)
  const [saving, setSaving] = useState(false)
  const initData = useRef<string | null>(null)
  const skipSave = useRef(true)
  const editSeq = useRef(0)
  const saveQueue = useRef(Promise.resolve())

  const headers = useCallback(() => ({ Authorization: `tma ${initData.current ?? ''}`, 'Content-Type': 'application/json' }), [])
  const load = useCallback(async () => {
    const response = await fetch(`/api/tg/calendar/${encodeURIComponent(slug)}`, { headers: { Authorization: `tma ${initData.current ?? ''}` } })
    if (!response.ok) throw new Error('load_failed')
    const next = await response.json() as CalendarPublicState
    setState(next)
    setViewerIntervals(viewerParticipant(next)?.intervals.map(parseInterval) ?? [])
    setTimeZone(next.viewer.timezone ?? detectBrowserTimeZone() ?? 'UTC')
  }, [slug])

  useEffect(() => {
    const app = window.Telegram?.WebApp
    initData.current = app?.initData ?? null
    if (!initData.current) { setError('Откройте календарь из Telegram.'); return }
    app?.ready?.()
    app?.requestFullscreen?.()
    void load().catch(() => setError('Не удалось открыть календарь. Попробуйте ещё раз из чата.'))
  }, [load])

  useEffect(() => {
    if (!state?.viewer.canEdit || skipSave.current) { skipSave.current = false; return }
    const sending = ++editSeq.current
    const snapshot = viewerIntervals.map(serializeInterval)
    const timer = window.setTimeout(() => {
      setSaving(true)
      saveQueue.current = saveQueue.current.then(async () => {
        const response = await fetch(`/api/tg/calendar/${encodeURIComponent(slug)}/availability`, {
          method: 'PUT', headers: headers(), body: JSON.stringify({ intervals: snapshot }),
        })
        if (!response.ok) throw new Error('save_failed')
      }).catch(() => setError('Не удалось сохранить отметку. Проверьте соединение и попробуйте ещё раз.'))
        .finally(() => { if (editSeq.current === sending) setSaving(false) })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [headers, slug, state?.viewer.canEdit, viewerIntervals])

  const participants = useMemo(() => state?.participants.map((participant) => (
    participant.ref === state.viewer.actingAsRef
      ? { ...participant, intervals: viewerIntervals.map(serializeInterval), marked: viewerIntervals.length > 0 }
      : participant
  )) ?? [], [state, viewerIntervals])
  const overlap = useMemo(() => state ? computeOverlap({
    participants: participants.map((participant) => ({
      ref: participant.ref,
      intervals: participant.intervals.map(parseInterval),
      busy: participant.busy.map((block) => ({ meetingId: `${participant.ref}:${block.startsAt}`, startsAt: new Date(block.startsAt), endsAt: new Date(block.endsAt), bookTitle: block.bookTitle ?? '' })),
    })),
    window: { start: new Date(state.window.start), end: new Date(state.window.end) }, now: new Date(state.now), durationMinutes: state.durationMinutes,
    circleBusy: state.meetings.filter((meeting) => meeting.canceledAt === null).map((meeting) => ({ meetingId: meeting.id, startsAt: new Date(meeting.startsAt), endsAt: new Date(new Date(meeting.startsAt).getTime() + meeting.durationMinutes * 60 * 1000), bookTitle: state.book.title })),
  }) : null, [participants, state])
  const viewerFreeKeys = useMemo(() => new Set(viewerIntervals.flatMap(enumerateSlots)), [viewerIntervals])
  const columns = useMemo<CalendarColumn[]>(() => state
    ? Array.from({ length: 7 }, (_, index) => ({ day: addLocalDays(startOfLocalDay(new Date(state.window.start), timeZone), index, timeZone) })) : [], [state, timeZone])

  function durationSpan() { return Math.max(1, state ? state.durationMinutes / SLOT_MINUTES : 1) }
  function blockKeys(key: string) { return Array.from({ length: durationSpan() }, (_, step) => addSlots(new Date(key), step).toISOString()) }
  function containingBlockKeys(key: string) {
    const span = durationSpan()
    for (const interval of normalize(viewerIntervals)) {
      const keys = enumerateSlots(interval)
      const index = keys.indexOf(key)
      if (index >= 0) return keys.slice(Math.floor(index / span) * span, Math.floor(index / span) * span + span)
    }
    return blockKeys(key)
  }
  function paint(keys: string[], mode: 'paint' | 'erase') {
    skipSave.current = false
    setViewerIntervals((current) => normalize(keys.reduce((intervals, key) => {
      const slot = { startsAt: new Date(key), endsAt: addSlots(new Date(key), 1) }
      return mode === 'paint' ? addInterval(intervals, slot) : removeInterval(intervals, slot)
    }, current)))
  }
  function toggleBlock(key: string) { const mode = viewerFreeKeys.has(key) ? 'erase' : 'paint'; paint(mode === 'erase' ? containingBlockKeys(key) : blockKeys(key), mode) }
  function onCellClick(key: string) {
    if (!state?.viewer.canEdit || overlap?.candidateStarts.has(key) || overlap?.cells.get(key)?.busyRefs.length) { setSelectedKey(key); return }
    setSelectedKey(null); toggleBlock(key)
  }
  async function scheduleMeeting() {
    if (!selectedKey) return
    setSaving(true)
    try {
      const response = await fetch(`/api/tg/calendar/${encodeURIComponent(slug)}/meetings`, { method: 'POST', headers: headers(), body: JSON.stringify({ startsAt: selectedKey }) })
      if (!response.ok) throw new Error('meeting_failed')
      setSelectedKey(null)
      await load()
    } catch { setError('Не удалось назначить встречу. Проверьте, что это окно всё ещё свободно.') } finally { setSaving(false) }
  }

  if (error) return <main style={shellStyle}><p role="alert">{error}</p></main>
  if (!state || !overlap) return <main style={shellStyle}><p>Загружаем календарь…</p></main>
  if (state.migrationRequired) return <main style={shellStyle}><p role="alert">Календарь временно недоступен: требуется обновление данных.</p></main>
  const selectedCandidate = selectedKey && overlap.candidateStarts.has(selectedKey)
  return <main data-testid="telegram-calendar" style={{ ...shellStyle, ['--calendar-cell-h' as string]: '44px' }}>
    <header style={{ borderBottom: '1px solid var(--hair)', paddingBottom: 14, marginBottom: 16 }}>
      <h1 style={{ fontFamily: 'var(--nd-serif)', fontSize: '1.65rem', lineHeight: 1.15, fontWeight: 400, margin: 0 }}>{state.book.title}</h1>
      {state.book.author && <p style={{ color: 'var(--text-secondary)', margin: '6px 0 0' }}>{state.book.author}</p>}
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '12px 0 0' }}>Отметьте удобное время. Сайт и Telegram используют одни данные.</p>
    </header>
    <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 14 }}>Часовой пояс
      <select aria-label="Часовой пояс" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} style={selectStyle}>{Array.from(new Set([timeZone, ...TIME_ZONES])).map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select>
    </label>
    {!state.viewer.canEdit && <p style={noticeStyle}>Просмотр: отмечать время и назначать встречу могут только участники круга.</p>}
    <p data-testid="telegram-save-status" style={{ minHeight: 18, color: 'var(--text-secondary)', fontSize: '0.78rem', margin: '0 0 8px' }}>{saving ? 'Сохраняем…' : 'Изменения сохраняются автоматически'}</p>
    <section aria-label="Сетка доступного времени" style={{ overflow: 'hidden', border: '1px solid var(--hair)', borderRadius: 'var(--radius-card)', padding: '10px 6px 12px', background: 'var(--bg-input)' }}>
      <CalendarGrid columns={columns} slotRange={showFullDay ? [0, 48] : [16, 44]} overlap={overlap} viewerFreeKeys={viewerFreeKeys} markerFreeKeys={viewerFreeKeys} focusRef={null} canEdit={state.viewer.canEdit} selectedKey={selectedKey} isMobile markedCount={overlap.markedRefs.length} timeZone={timeZone} onPaint={paint} onCellClick={onCellClick} />
    </section>
    <button type="button" onClick={() => setShowFullDay((value) => !value)} style={linkButtonStyle}>{showFullDay ? 'Показать только день и вечер' : 'Показать все сутки'}</button>
    {selectedKey && <section aria-live="polite" style={noticeStyle}>
      <b>{formatInZone(new Date(selectedKey), timeZone, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</b>
      {selectedCandidate ? <><p style={{ margin: '6px 0' }}>Это окно подходит всем, кто уже отметил время.</p>{state.viewer.canEdit && <button type="button" onClick={() => void scheduleMeeting()} disabled={saving} style={primaryButtonStyle}>Назначить встречу</button>}</> : <p style={{ margin: '6px 0 0' }}>Отметьте время у себя, чтобы помочь группе найти пересечение.</p>}
    </section>}
    {state.meetings.filter((meeting) => meeting.canceledAt === null).length > 0 && <section aria-label="Назначенные встречи" style={{ marginTop: 16 }}><h2 style={{ fontSize: '1rem', margin: '0 0 8px' }}>Назначенные встречи</h2>{state.meetings.filter((meeting) => meeting.canceledAt === null).map((meeting) => <p key={meeting.id} style={{ margin: '4px 0', color: 'var(--text-secondary)' }}>{formatInZone(new Date(meeting.startsAt), timeZone, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>)}</section>}
  </main>
}

function viewerParticipant(state: CalendarPublicState) { return state.participants.find((participant) => participant.ref === state.viewer.actingAsRef) }
function parseInterval(interval: { startsAt: string; endsAt: string }): Interval { return { startsAt: new Date(interval.startsAt), endsAt: new Date(interval.endsAt) } }
function serializeInterval(interval: Interval) { return { startsAt: interval.startsAt.toISOString(), endsAt: interval.endsAt.toISOString() } }

const shellStyle = { minHeight: '100svh', maxWidth: 560, margin: '0 auto', padding: '16px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--nd-sans)' }
const selectStyle = { display: 'block', width: '100%', minHeight: 44, marginTop: 5, padding: '0 10px', color: 'var(--text)', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', font: 'inherit' }
const noticeStyle = { marginTop: 12, padding: '12px', borderLeft: '2px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--text-body)', fontSize: '0.84rem' }
const linkButtonStyle = { minHeight: 44, marginTop: 8, padding: '0 4px', border: 'none', borderBottom: '1px solid var(--hair)', color: 'var(--text-secondary)', background: 'transparent', font: 'inherit' }
const primaryButtonStyle = { minHeight: 44, padding: '0 14px', border: 'none', borderRadius: 'var(--radius-control)', color: 'var(--bg-input)', background: 'var(--text)', font: 'inherit' }
