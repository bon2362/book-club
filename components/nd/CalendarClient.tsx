'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CalendarCellPopover from './CalendarCellPopover'
import CalendarGrid, { type CalendarColumn } from './CalendarGrid'
import CalendarLegend from './CalendarLegend'
import CalendarMeetingCard from './CalendarMeetingCard'
import CalendarParticipants from './CalendarParticipants'
import CalendarTimezoneBar from './CalendarTimezoneBar'
import { addInterval, normalize, removeInterval } from '@/lib/calendar/availability-intervals'
import { computeOverlap } from '@/lib/calendar/overlap'
import { addSlots, enumerateSlots, SLOT_MINUTES, type Interval } from '@/lib/calendar/slots'
import type { CalendarPublicState } from '@/lib/calendar/public-state'
import { addLocalDays, detectBrowserTimeZone, formatInZone, localDayKey, startOfLocalDay } from '@/lib/calendar/timezone'

export default function CalendarClient({
  initialState,
  actingUserId,
}: {
  initialState: CalendarPublicState
  actingUserId?: string
}) {
  const [state, setState] = useState(initialState)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [focusRef, setFocusRef] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [crop, setCrop] = useState(Boolean(initialState.viewer.ref && initialState.participants.find((p) => p.ref === initialState.viewer.actingAsRef)?.marked))
  const [fullDay, setFullDay] = useState(false)
  const [expanded, setExpanded] = useState(initialState.meetings.filter((meeting) => meeting.canceledAt === null && new Date(meeting.startsAt) > new Date(initialState.now)).length === 0)
  const [isDesktop, setIsDesktop] = useState(false)
  const [isNarrow, setIsNarrow] = useState(false)
  const [viewerIntervals, setViewerIntervals] = useState<Interval[]>(() => actingParticipant(initialState)?.intervals.map(parseInterval) ?? [])
  const [timeZone, setTimeZone] = useState(state.viewer.timezone ?? 'UTC')
  const [tzConfirmed, setTzConfirmed] = useState(state.viewer.timezoneConfirmed)
  const skipSave = useRef(true)
  const asQuery = actingUserId ? `?as=${encodeURIComponent(actingUserId)}` : ''

  const reloadState = useCallback(async () => {
    const response = await fetch(`/api/calendar/${state.slug}${asQuery}`)
    if (response.ok) setState(await response.json())
  }, [asQuery, state.slug])

  useEffect(() => {
    const query = window.matchMedia('(hover: hover) and (pointer: fine)')
    const update = () => setIsDesktop(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  // Пояс браузера определяется только на клиенте: на сервере Intl вернёт пояс
  // сервера (UTC), и анонимный посетитель навсегда остался бы с UTC-сеткой.
  useEffect(() => {
    if (state.viewer.timezone) {
      setTimeZone(state.viewer.timezone)
      return
    }
    const detected = detectBrowserTimeZone()
    if (!detected) return
    setTimeZone(detected)
    if (!state.viewer.ref) return
    void fetch('/api/profile/timezone', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: detected, confirmed: false }),
    })
  }, [state.viewer.ref, state.viewer.timezone])

  // Ширина, а не тип указателя: на узком экране клетка выше, чтобы в неё можно
  // было попасть пальцем. Порог тот же 540px, что и на доске матчинга.
  useEffect(() => {
    const query = window.matchMedia('(max-width: 540px)')
    const update = () => setIsNarrow(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  // Каждая локальная правка увеличивает editSeq; savedSeq — номер правки, которую
  // сервер уже подтвердил. Пока они расходятся, у нас есть несохранённые изменения,
  // и серверный ответ (он отражает состояние на момент отправки, а не текущее)
  // не имеет права затирать локальные интервалы. Без этого клики, сделанные пока
  // летит запрос, откатывались назад и терялись.
  const editSeq = useRef(0)
  const savedSeq = useRef(0)
  const hasUnsavedEdits = () => editSeq.current !== savedSeq.current

  useEffect(() => {
    if (hasUnsavedEdits()) return
    const next = actingParticipant(state)?.intervals.map(parseInterval) ?? []
    setViewerIntervals((current) => {
      if (intervalsEqual(current, next)) return current
      skipSave.current = true
      return next
    })
  }, [state])

  useEffect(() => {
    if (!state.viewer.canEdit || skipSave.current) {
      skipSave.current = false
      return
    }
    const timer = setTimeout(() => {
      const sending = editSeq.current
      void fetch(`/api/calendar/availability${asQuery}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intervals: viewerIntervals.map((interval) => ({
            startsAt: interval.startsAt.toISOString(),
            endsAt: interval.endsAt.toISOString(),
          })),
        }),
      }).then(() => {
        savedSeq.current = sending
        // Пока пользователь дорисовывал, появились более свежие правки — их сохранит
        // следующий проход, а перечитывать состояние сейчас нельзя: ответ устарел.
        if (editSeq.current !== sending) return
        return reloadState()
      })
    }, 400)
    return () => clearTimeout(timer)
  }, [asQuery, reloadState, state.viewer.canEdit, viewerIntervals])

  const participants = useMemo(() => state.participants.map((participant) => (
    participant.ref === state.viewer.actingAsRef
      ? { ...participant, intervals: viewerIntervals.map((interval) => ({ startsAt: interval.startsAt.toISOString(), endsAt: interval.endsAt.toISOString() })), marked: viewerIntervals.length > 0 }
      : participant
  )), [state.participants, state.viewer.actingAsRef, viewerIntervals])

  const busyParticipants = useMemo(() => participants.map((participant) => ({
    ref: participant.ref,
    intervals: participant.intervals.map(parseInterval),
    busy: participant.busy.map((block) => ({
      meetingId: `${participant.ref}:${block.startsAt}`,
      startsAt: new Date(block.startsAt),
      endsAt: new Date(block.endsAt),
      bookTitle: block.bookTitle ?? '',
    })),
  })), [participants])

  const overlap = useMemo(() => computeOverlap({
    participants: busyParticipants,
    window: { start: new Date(state.window.start), end: new Date(state.window.end) },
    now: new Date(state.now),
    durationMinutes: state.durationMinutes,
    circleBusy: state.meetings
      .filter((meeting) => meeting.canceledAt === null)
      .map((meeting) => ({
        meetingId: meeting.id,
        startsAt: new Date(meeting.startsAt),
        endsAt: new Date(new Date(meeting.startsAt).getTime() + meeting.durationMinutes * 60 * 1000),
        bookTitle: state.book.title,
      })),
  }), [busyParticipants, state])

  const viewerFreeKeys = useMemo(() => new Set(viewerIntervals.flatMap(enumerateSlots)), [viewerIntervals])
  // Фокус — это фильтр «показать время одного человека», он включается только явно.
  // Автоматический фокус в админском режиме прятал тепловую карту остальных (#547).
  const markerFreeKeys = !focusRef || focusRef === state.viewer.actingAsRef ? viewerFreeKeys : new Set<string>()
  const dayStarts = useMemo(() => buildDayStarts(new Date(state.window.start), timeZone), [state.window.start, timeZone])
  const activeDayIndexes = useMemo(() => {
    const active = new Set<number>()
    for (const participant of participants) {
      for (const interval of participant.intervals) active.add(dayIndexFor(new Date(interval.startsAt), dayStarts, timeZone))
    }
    for (const meeting of state.meetings) active.add(dayIndexFor(new Date(meeting.startsAt), dayStarts, timeZone))
    return Array.from(active).filter((index) => index >= 0 && index < 28).sort((a, b) => a - b)
  }, [participants, state.meetings, dayStarts, timeZone])

  const shownDayIndexes = crop && activeDayIndexes.length > 0 ? activeDayIndexes : Array.from({ length: 28 }, (_, index) => index)
  const perPage = 7
  const pageDays = shownDayIndexes.slice(page * perPage, page * perPage + perPage)
  const columns: CalendarColumn[] = pageDays.flatMap((dayIndex, index) => {
    const column = { day: dayStarts[dayIndex] }
    if (index > 0 && dayIndex - pageDays[index - 1] > 1) return [{ day: dayStarts[dayIndex], hiddenGap: true }, column]
    return [column]
  })
  const pages = Math.max(1, Math.ceil(shownDayIndexes.length / perPage))
  const daysHidden = crop && activeDayIndexes.length > 0 && activeDayIndexes.length < 28
  const slotRange: [number, number] = fullDay ? [0, 48] : visibleSlotRange(participants, state.meetings, dayStarts, pageDays, crop, timeZone)
  const upcoming = state.meetings
    .filter((meeting) => meeting.canceledAt === null && new Date(meeting.startsAt) >= new Date(state.now))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
  const past = state.meetings
    .filter((meeting) => meeting.canceledAt !== null || new Date(meeting.startsAt) < new Date(state.now))
    .sort((left, right) => right.startsAt.localeCompare(left.startsAt))
  const selectedCell = selectedKey ? overlap.cells.get(selectedKey) : null
  const durationOptions = [30, 60, 90, 120, 150, 180]

  function durationSpan() {
    return Math.max(1, state.durationMinutes / SLOT_MINUTES)
  }

  function blockKeys(key: string) {
    const startsAt = new Date(key)
    return Array.from({ length: durationSpan() }, (_, step) => addSlots(startsAt, step).toISOString())
  }

  function containingBlockKeys(key: string) {
    const span = durationSpan()
    for (const interval of normalize(viewerIntervals)) {
      const keys = enumerateSlots(interval)
      const index = keys.indexOf(key)
      if (index === -1) continue
      const blockStart = Math.floor(index / span) * span
      return keys.slice(blockStart, blockStart + span)
    }
    return blockKeys(key)
  }

  function paint(keys: string[], mode: 'paint' | 'erase') {
    editSeq.current += 1
    setViewerIntervals((current) => {
      let next = current
      for (const key of keys) {
        const interval = { startsAt: new Date(key), endsAt: addSlots(new Date(key), 1) }
        next = mode === 'paint' ? addInterval(next, interval) : removeInterval(next, interval)
      }
      return normalize(next)
    })
  }

  function toggleBlock(key: string) {
    const mode = viewerFreeKeys.has(key) ? 'erase' : 'paint'
    paint(mode === 'erase' ? containingBlockKeys(key) : blockKeys(key), mode)
  }

  function handleCellClick(key: string) {
    if (!state.viewer.canEdit) {
      setSelectedKey(key)
      return
    }
    const cell = overlap.cells.get(key)
    const busy = Boolean(cell?.busyRefs.length)
    if (busy || (viewerFreeKeys.has(key) && overlap.candidateStarts.has(key))) {
      setSelectedKey(key)
      return
    }
    setSelectedKey(null)
    toggleBlock(key)
  }

  async function changeTimeZone(zone: string, confirmed: boolean) {
    setTimeZone(zone)
    setTzConfirmed(confirmed)
    if (!state.viewer.ref) return
    await fetch('/api/profile/timezone', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: zone, confirmed }),
    })
  }

  async function updateDuration(durationMinutes: number) {
    setState((current) => ({ ...current, durationMinutes }))
    const response = await fetch(`/api/calendar/${state.slug}${asQuery}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durationMinutes }),
    })
    if (response.ok) await reloadState()
  }

  function actAs(userId: string) {
    window.location.assign(`/calendar/${state.slug}?as=${encodeURIComponent(userId)}`)
  }

  async function scheduleMeeting(key: string) {
    const response = await fetch(`/api/calendar/${state.slug}/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startsAt: key }),
    })
    if (response.ok) {
      setSelectedKey(null)
      setExpanded(false)
      await reloadState()
    }
  }

  async function cancelMeeting(id: string) {
    const response = await fetch(`/api/calendar/${state.slug}/meetings/${id}`, { method: 'DELETE' })
    if (response.ok) {
      setExpanded(true)
      await reloadState()
    }
  }

  if (state.migrationRequired) {
    return <Shell><Banner><b>Календарь ещё не включён.</b> Код уже задеплоен, но оператор ещё не применил миграцию БД.</Banner></Shell>
  }

  return (
    <Shell cellHeight={isNarrow ? 26 : 22}>
      <CalendarTimezoneBar
        value={timeZone}
        confirmed={tzConfirmed}
        canPersist={Boolean(state.viewer.ref)}
        onChange={changeTimeZone}
      />
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, borderBottom: '1px solid var(--hair)', paddingBottom: 20, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--nd-serif)', fontSize: '2rem', lineHeight: 1.15, margin: '0 0 6px', fontWeight: 400 }}>{state.book.title}</h1>
          {state.book.author && <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{state.book.author}</div>}
          <label style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            <span>Длительность встречи</span>
            <select
              aria-label="Длительность встречи"
              value={state.durationMinutes}
              disabled={!state.viewer.canEdit}
              onChange={(event) => void updateDuration(Number(event.target.value))}
              style={{ font: 'inherit', fontFamily: 'var(--nd-mono)', fontSize: '0.78rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderBottom: '2px solid var(--border-strong)', padding: '3px 6px', color: 'var(--text)' }}
            >
              {durationOptions.map((minutes) => <option key={minutes} value={minutes}>{minutes} мин</option>)}
            </select>
          </label>
        </div>
      </header>
      {!state.circleExists && <Banner><b>Круг больше не существует.</b> Состав книги пересобран. Назначенные встречи сохранены, но новые действия здесь недоступны.</Banner>}
      {!state.viewer.ref && <Banner>Вы смотрите страницу по ссылке. Видно наложение и встречи; закрашивать своё время могут только участники круга.</Banner>}
      {state.viewer.isAdmin && state.viewer.actingAsRef && <Banner>Админский режим: действия выполняются за выбранного участника. В журнале останется административный actor.</Banner>}

      {upcoming.map((meeting) => <CalendarMeetingCard key={meeting.id} meeting={meeting} bookTitle={state.book.title} timeZone={timeZone} canEdit={state.viewer.canEdit} onCancel={() => void cancelMeeting(meeting.id)} />)}

      {upcoming.length > 0 && (
        <button type="button" onClick={() => setExpanded((value) => !value)} style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--hair)', padding: 0, color: 'var(--text-body)', cursor: 'pointer', margin: '8px 0 16px', font: 'inherit' }}>
          {expanded ? 'Свернуть календарь' : 'Назначить ещё встречу'}
        </button>
      )}

      {(expanded || upcoming.length === 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 216px', gap: isNarrow ? 20 : 28, alignItems: 'start' }}>
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <button
                type="button"
                aria-label="Предыдущие дни"
                disabled={page === 0}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                style={navButtonStyle(page === 0, isNarrow)}
              >‹</button>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-body)', textAlign: 'center' }}>
                {pageDays.length ? `${formatDay(dayStarts[pageDays[0]], timeZone)} — ${formatDay(dayStarts[pageDays.at(-1)!], timeZone)}` : '—'}
                {daysHidden && <span style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.13em', fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>дни без отметок скрыты</span>}
              </div>
              <button
                type="button"
                aria-label="Следующие дни"
                disabled={page >= pages - 1}
                onClick={() => setPage((value) => Math.min(pages - 1, value + 1))}
                style={navButtonStyle(page >= pages - 1, isNarrow)}
              >›</button>
            </div>
            <div style={{ position: 'relative', background: 'var(--bg-input)', border: '1px solid var(--hair)', borderRadius: 'var(--radius-card)', padding: '10px 12px 12px', overflow: 'visible' }}>
              {participants.every((participant) => !participant.marked) && (
                <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', border: '1px dashed var(--hair)', borderRadius: 'var(--radius-card)', background: 'var(--surface-soft)', marginBottom: 12 }}>
                  <b style={{ display: 'block', fontFamily: 'var(--nd-serif)', fontSize: '1.05rem', color: 'var(--text)', fontWeight: 400, marginBottom: 6 }}>Пока никто не отметил своё время</b>
                  {state.viewer.canEdit ? 'Выберите клетки в сетке. Сохранение идёт автоматически.' : 'Участники круга ещё не заполняли календарь.'}
                </div>
              )}
              <CalendarGrid
                columns={columns}
                slotRange={slotRange}
                overlap={overlap}
                viewerFreeKeys={viewerFreeKeys}
                markerFreeKeys={markerFreeKeys}
                focusRef={focusRef}
                canEdit={state.viewer.canEdit}
                selectedKey={selectedKey}
                isMobile={false}
                markedCount={overlap.markedRefs.length}
                timeZone={timeZone}
                onPaint={paint}
                onCellClick={handleCellClick}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--hair-soft)', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', overflow: 'hidden' }}>
                  <Toggle active={crop} onClick={() => { setCrop(true); setPage(0) }}>Дни с отметками</Toggle>
                  <Toggle active={!crop} onClick={() => { setCrop(false); setPage(0) }}>Все дни подряд</Toggle>
                </div>
                <button type="button" onClick={() => setFullDay((value) => !value)} style={{ background: 'none', border: 'none', borderBottom: '1px solid var(--hair)', padding: '0 0 1px', color: 'var(--text-secondary)', cursor: 'pointer', font: 'inherit', fontSize: '0.75rem' }}>{fullDay ? 'Свернуть до вечера' : 'Показать сутки'}</button>
              </div>
            </div>
          </section>
          <section>
            <CalendarParticipants
              participants={participants}
              viewerRef={state.viewer.ref}
              focusRef={focusRef}
              isDesktop={isDesktop}
              isAdmin={state.viewer.isAdmin}
              onFocus={setFocusRef}
              onActAs={actAs}
              referenceDate={new Date(state.now)}
            />
            <CalendarLegend markedCount={overlap.markedRefs.length} />
          </section>
        </div>
      )}

      {past.length > 0 && (
        <details style={{ margin: '18px 0 0' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Уже прошли ({past.length})</summary>
          <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>{past.map((meeting) => <li key={meeting.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 10px', background: 'var(--surface-soft)', fontSize: '0.82rem', color: 'var(--text-body)' }}>{formatDateTime(new Date(meeting.startsAt), timeZone)}<span>{meeting.durationMinutes} мин</span></li>)}</ul>
        </details>
      )}

      {selectedKey && selectedCell && (
        <CalendarCellPopover
          slotKey={selectedKey}
          cell={selectedCell}
          participants={participants}
          markedCount={overlap.markedRefs.length}
          timeZone={timeZone}
          canEdit={state.viewer.canEdit}
          canSchedule={overlap.candidateStarts.has(selectedKey)}
          viewerFree={viewerFreeKeys.has(selectedKey)}
          onClose={() => setSelectedKey(null)}
          onSchedule={() => void scheduleMeeting(selectedKey)}
          onToggleMine={() => toggleBlock(selectedKey)}
        />
      )}
    </Shell>
  )
}

function actingParticipant(state: CalendarPublicState) {
  return state.participants.find((participant) => participant.ref === state.viewer.actingAsRef) ?? null
}

function parseInterval(interval: { startsAt: string; endsAt: string }): Interval {
  return { startsAt: new Date(interval.startsAt), endsAt: new Date(interval.endsAt) }
}

function intervalsEqual(left: Interval[], right: Interval[]) {
  if (left.length !== right.length) return false
  return left.every((interval, index) => (
    interval.startsAt.getTime() === right[index].startsAt.getTime()
    && interval.endsAt.getTime() === right[index].endsAt.getTime()
  ))
}

function buildDayStarts(windowStart: Date, timeZone: string) {
  const first = startOfLocalDay(windowStart, timeZone)
  return Array.from({ length: 28 }, (_, index) => addLocalDays(first, index, timeZone))
}

function dayIndexFor(date: Date, dayStarts: Date[], timeZone: string) {
  const key = localDayKey(date, timeZone)
  return dayStarts.findIndex((dayStart) => localDayKey(dayStart, timeZone) === key)
}

function visibleSlotRange(participants: CalendarPublicState['participants'], meetings: CalendarPublicState['meetings'], dayStarts: Date[], pageDays: number[], crop: boolean, timeZone: string): [number, number] {
  if (!crop) return [20, 42]
  let min = 48
  let max = 0
  const days = new Set(pageDays)
  for (const participant of participants) {
    for (const interval of participant.intervals) {
      const start = new Date(interval.startsAt)
      const end = new Date(interval.endsAt)
      const day = dayIndexFor(start, dayStarts, timeZone)
      if (!days.has(day)) continue
      min = Math.min(min, slotInDay(start, timeZone))
      max = Math.max(max, slotInDay(end, timeZone))
    }
  }
  for (const meeting of meetings) {
    const start = new Date(meeting.startsAt)
    const day = dayIndexFor(start, dayStarts, timeZone)
    if (!days.has(day)) continue
    min = Math.min(min, slotInDay(start, timeZone))
    max = Math.max(max, slotInDay(addSlots(start, meeting.durationMinutes / SLOT_MINUTES), timeZone))
  }
  if (min >= max) return [20, 42]
  return [Math.max(0, min - 2), Math.min(48, max + 2)]
}

function slotInDay(date: Date, timeZone: string) {
  const dayStart = startOfLocalDay(date, timeZone)
  return Math.round((date.getTime() - dayStart.getTime()) / (SLOT_MINUTES * 60 * 1000))
}

function formatDay(date: Date, timeZone: string) {
  return formatInZone(date, timeZone, { day: 'numeric', month: 'short' })
}

function formatDateTime(date: Date, timeZone: string) {
  return formatInZone(date, timeZone, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function Shell({ children, cellHeight = 22 }: { children: React.ReactNode; cellHeight?: number }) {
  return <main style={{ maxWidth: 1080, margin: '0 auto', padding: `28px ${cellHeight === 22 ? 32 : 16}px 96px`, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--nd-sans)', minHeight: '100svh', ['--calendar-cell-h' as string]: `${cellHeight}px` }}>{children}</main>
}

function Banner({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '14px 16px', borderLeft: '2px solid var(--accent)', background: 'var(--accent-soft)', fontSize: '0.85rem', color: 'var(--text-body)', marginBottom: 20, borderRadius: 2 }}>{children}</div>
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} style={{ font: 'inherit', fontSize: '0.72rem', padding: '5px 10px', background: active ? 'var(--text)' : 'transparent', border: 'none', cursor: 'pointer', color: active ? 'var(--bg-input)' : 'var(--text-secondary)' }}>{children}</button>
}

/**
 * Отключённая стрелка обязана выглядеть отключённой: без этого при обрезке по
 * отметкам страница одна, обе стрелки мертвы, а на вид живые — тап по ним
 * читается как поломка. На узком экране цель увеличена до 44px под палец.
 */
function navButtonStyle(disabled: boolean, isNarrow: boolean) {
  const size = isNarrow ? 44 : 30
  return {
    width: size,
    height: size,
    flex: 'none',
    border: '1px solid var(--border)',
    background: 'var(--bg-input)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.3 : 1,
    borderRadius: 'var(--radius-control)',
    color: 'var(--text)',
    fontSize: '0.9rem',
    lineHeight: 1,
  } as const
}
