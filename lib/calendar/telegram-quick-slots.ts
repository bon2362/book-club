import { addLocalDays, formatInZone, localDayKey, startOfLocalDay, zoneOffsetMs } from '@/lib/calendar/timezone'
import { SLOT_MINUTES, type Interval } from '@/lib/calendar/slots'

/** Пояс подписей в Telegram-теме. Личный пояс участника действует только в полной сетке. */
export const TELEGRAM_TOPIC_TIME_ZONE = 'Europe/Belgrade'
export const TELEGRAM_QUICK_SLOT_LIMIT = 6
export const TELEGRAM_DEFAULT_HORIZON_DAYS = 14

/** Базовый ритм клуба: вт/чт вечером, сб/вс днём (местное время Белграда). */
const DEFAULT_RHYTHM: Record<string, { hour: number; minute: number }> = {
  Tue: { hour: 19, minute: 0 },
  Thu: { hour: 19, minute: 0 },
  Sat: { hour: 12, minute: 0 },
  Sun: { hour: 12, minute: 0 },
}

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS
const SLOT_MS = SLOT_MINUTES * MINUTE_MS

export interface TelegramQuickSlot {
  startsAt: Date
  endsAt: Date
  markedCount: number
  selectedByViewer: boolean
}

export interface TelegramQuickSlotInput {
  participants: Array<{ ref: string; intervals: Interval[] }>
  /** Активные (не отменённые) встречи этого круга. */
  meetings: Interval[]
  durationMinutes: number
  now: Date
  /** Конец окна календаря: блок обязан целиком помещаться в него. */
  windowEnd: Date
  viewerRef?: string | null
  limit?: number
  timeZone?: string
}

export interface TelegramQuickSlotSelection {
  mode: 'default' | 'marked'
  slots: TelegramQuickSlot[]
}

function covers(intervals: Interval[], startsAt: Date, endsAt: Date): boolean {
  return intervals.some((interval) => interval.startsAt <= startsAt && interval.endsAt >= endsAt)
}

function overlapsAny(blocks: Interval[], startsAt: Date, endsAt: Date): boolean {
  return blocks.some((block) => block.startsAt < endsAt && startsAt < block.endsAt)
}

/** Момент, когда в поясе timeZone на часах y-m-d h:m. Два прохода — ради дней перевода часов. */
export function zonedInstant(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute)
  const firstGuess = asUtc - zoneOffsetMs(new Date(asUtc), timeZone)
  return new Date(asUtc - zoneOffsetMs(new Date(firstGuess), timeZone))
}

function weekdayIn(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(instant)
}

function defaultStarts(now: Date, timeZone: string): Date[] {
  const horizon = now.getTime() + TELEGRAM_DEFAULT_HORIZON_DAYS * DAY_MS
  const firstDay = startOfLocalDay(now, timeZone)
  const starts: Date[] = []
  for (let index = 0; index <= TELEGRAM_DEFAULT_HORIZON_DAYS; index += 1) {
    const day = addLocalDays(firstDay, index, timeZone)
    const rhythm = DEFAULT_RHYTHM[weekdayIn(new Date(day.getTime() + DAY_MS / 2), timeZone)]
    if (!rhythm) continue
    const [year, month, date] = localDayKey(day, timeZone).split('-').map(Number)
    const startsAt = zonedInstant(year, month, date, rhythm.hour, rhythm.minute, timeZone)
    if (startsAt.getTime() > now.getTime() && startsAt.getTime() <= horizon) starts.push(startsAt)
  }
  return starts
}

/**
 * Быстрые варианты для сообщения темы.
 *
 * Пока никто из круга не отметил время — ближайшие будущие слоты базового ритма.
 * После первой отметки — только реальные старты (шаг 30 минут), где весь блок
 * длительности встречи лежит внутри чьего-то интервала; сортировка по числу
 * отметивших, затем по близости. Прошедшие и пересекающие встречу круга старты
 * исключаются. Если после первой отметки ни одного годного старта не осталось
 * (например, всё отмеченное уже занято встречей), показываются базовые варианты,
 * чтобы у темы не пропадали кнопки.
 */
export function selectTelegramQuickSlots(input: TelegramQuickSlotInput): TelegramQuickSlotSelection {
  const limit = input.limit ?? TELEGRAM_QUICK_SLOT_LIMIT
  const timeZone = input.timeZone ?? TELEGRAM_TOPIC_TIME_ZONE
  const durationMs = Math.max(SLOT_MINUTES, input.durationMinutes) * MINUTE_MS
  const viewer = input.participants.find((participant) => participant.ref === input.viewerRef)
  const valid = (startsAt: Date, endsAt: Date) => startsAt.getTime() > input.now.getTime()
    && endsAt.getTime() <= input.windowEnd.getTime()
    && !overlapsAny(input.meetings, startsAt, endsAt)
  const toSlot = (startsAt: Date, endsAt: Date): TelegramQuickSlot => ({
    startsAt,
    endsAt,
    markedCount: input.participants.filter((participant) => covers(participant.intervals, startsAt, endsAt)).length,
    selectedByViewer: viewer ? covers(viewer.intervals, startsAt, endsAt) : false,
  })

  const anyoneMarked = input.participants.some((participant) => participant.intervals.length > 0)
  if (anyoneMarked) {
    const starts = new Set<number>()
    for (const participant of input.participants) {
      for (const interval of participant.intervals) {
        const first = Math.ceil(interval.startsAt.getTime() / SLOT_MS) * SLOT_MS
        for (let at = first; at + durationMs <= interval.endsAt.getTime(); at += SLOT_MS) starts.add(at)
      }
    }
    const marked = Array.from(starts)
      .map((at) => toSlot(new Date(at), new Date(at + durationMs)))
      .filter((slot) => slot.markedCount > 0 && valid(slot.startsAt, slot.endsAt))
      .sort((left, right) => right.markedCount - left.markedCount || left.startsAt.getTime() - right.startsAt.getTime())
      .slice(0, limit)
    if (marked.length > 0) return { mode: 'marked', slots: marked }
  }

  const defaults = defaultStarts(input.now, timeZone)
    .map((startsAt) => toSlot(startsAt, new Date(startsAt.getTime() + durationMs)))
    .filter((slot) => valid(slot.startsAt, slot.endsAt))
    .slice(0, limit)
  return { mode: 'default', slots: defaults }
}

/** CET/CEST по фактическому смещению Белграда в этот момент. */
export function belgradeZoneAbbreviation(instant: Date, timeZone = TELEGRAM_TOPIC_TIME_ZONE): string {
  const offsetMinutes = Math.round(zoneOffsetMs(instant, timeZone) / MINUTE_MS)
  if (timeZone === TELEGRAM_TOPIC_TIME_ZONE && offsetMinutes === 60) return 'CET'
  if (timeZone === TELEGRAM_TOPIC_TIME_ZONE && offsetMinutes === 120) return 'CEST'
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  return `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, '0')}` : ''}`
}

/** «Вт 24.11 19:00 CET» — подпись кнопки и встречи в теме. */
export function formatTelegramSlotLabel(instant: Date, timeZone = TELEGRAM_TOPIC_TIME_ZONE): string {
  const weekday = formatInZone(instant, timeZone, { weekday: 'short' }).replace('.', '')
  const date = formatInZone(instant, timeZone, { day: '2-digit', month: '2-digit' })
  const time = formatInZone(instant, timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${date} ${time} ${belgradeZoneAbbreviation(instant, timeZone)}`
}
