import type { CSSProperties } from 'react'
import type { HistoricalDate } from '@/lib/timeline'

/**
 * Общие примитивы вкладки «Ленты времени»: стили с `/styleguide`, типы строк
 * из маршрутов и мелкие преобразования. Вынесены отдельно, чтобы три формы и
 * панель не расползались копиями одного и того же — урок `AdminBooksCatalog`.
 */

export const SANS = 'var(--nd-sans), system-ui, -apple-system, sans-serif'
export const SERIF = 'var(--nd-serif), Georgia, serif'

export const microLabelStyle: CSSProperties = {
  fontFamily: SANS,
  fontSize: '0.6rem',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--text-muted)',
  display: 'block',
  marginBottom: '0.35rem',
}

export const inputStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  fontFamily: SANS,
  fontSize: '0.82rem',
  color: 'var(--text)',
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderBottom: '2px solid var(--border-strong)',
  padding: '0.4rem 0.5rem',
  outline: 'none',
}

export const selectStyle: CSSProperties = { ...inputStyle, cursor: 'pointer' }

export const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: '9rem',
  lineHeight: 1.5,
  resize: 'vertical',
}

export function buttonStyle(variant: 'primary' | 'ghost' | 'danger' = 'ghost'): CSSProperties {
  const color =
    variant === 'danger' ? 'var(--accent)' : variant === 'primary' ? 'var(--bg)' : 'var(--text)'
  return {
    fontFamily: SANS,
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    padding: '0.4rem 0.9rem',
    border: `1px solid ${variant === 'danger' ? 'var(--accent)' : 'var(--text)'}`,
    background: variant === 'primary' ? 'var(--text)' : 'transparent',
    color,
    cursor: 'pointer',
  }
}

export const errorStyle: CSSProperties = {
  fontFamily: SANS,
  fontSize: '0.75rem',
  color: 'var(--accent)',
  borderLeft: '2px solid var(--accent)',
  paddingLeft: '0.6rem',
  margin: '0.75rem 0 0',
}

export const fieldRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
  gap: '0.9rem',
  marginBottom: '1rem',
}

export const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  width: '100%',
  textAlign: 'left',
  padding: '0.6rem 0',
  borderBottom: '1px solid var(--border)',
  background: 'transparent',
  border: 'none',
  borderBottomWidth: '1px',
  borderBottomStyle: 'solid',
  borderBottomColor: 'var(--border)',
  cursor: 'pointer',
  fontFamily: SANS,
  fontSize: '0.85rem',
  color: 'var(--text)',
}

// --- Типы строк, которые отдают маршруты -----------------------------------

export interface AdminEventType {
  id: string
  title: string
  color: string
  icon: string
  usageCount: number
}

interface DateColumnsShape {
  startYear: number
  startEra: string
  startMonth: number | null
  startDay: number | null
  endYear: number | null
  endEra: string | null
  endMonth: number | null
  endDay: number | null
}

export interface AdminEventRow extends DateColumnsShape {
  id: string
  title: string
  eventTypeId: string
  typeTitle: string
  typeColor: string
  typeIcon: string
  ongoing: boolean
  description: string
  imageUrl: string | null
  imageCaption: string | null
}

export interface AdminEpochRow extends DateColumnsShape {
  id: string
  title: string
  description: string
  imageUrl: string | null
  imageCaption: string | null
}

export interface AdminTimelineDetail {
  id: string
  slug: string
  title: string
  description: string
  published: boolean
}

export interface AdminTimelineSummary extends AdminTimelineDetail {
  eventCount: number
}

/** Событие, включённое в ленту: строка справочника плюс заметка этой ленты. */
export interface AdminTimelineEvent extends AdminEventRow {
  note: string
  visible: boolean
}

/** Эпоха на ленте: строка справочника плюс её оформление на этой ленте. */
export interface AdminTimelineEpoch extends AdminEpochRow {
  note: string
  color: string
  visible: boolean
  pinnedLane: number | null
}

/** Ответ `GET /api/admin/timeline/timelines/[id]/contents`. */
export interface AdminTimelineContents {
  timeline: AdminTimelineSummary
  events: AdminTimelineEvent[]
  epochs: AdminTimelineEpoch[]
  availableEvents: AdminEventRow[]
  availableEpochs: AdminEpochRow[]
}

/** Даты строки справочника — для сортировки хронологией, а не по названию. */
export function rowStart(row: {
  startYear: number
  startEra: string
  startMonth: number | null
  startDay: number | null
}): HistoricalDate {
  return makeDate(row.startYear, row.startEra === 'BCE' ? 'BCE' : 'CE', row.startMonth, row.startDay)
}

// --- Значения форм ---------------------------------------------------------

export interface EventFormValue {
  title: string
  eventTypeId: string
  start: HistoricalDate
  end: HistoricalDate | null
  ongoing: boolean
  description: string
  imageUrl: string
  imageCaption: string
}

export interface EpochFormValue {
  title: string
  start: HistoricalDate
  end: HistoricalDate
  description: string
  imageUrl: string
  imageCaption: string
}

export function makeDate(
  year: number,
  era: 'BCE' | 'CE',
  month: number | null,
  day: number | null,
): HistoricalDate {
  const date: HistoricalDate = { year, era }
  if (month != null) date.month = month
  if (day != null) date.day = day
  return date
}

function startOf(row: DateColumnsShape): HistoricalDate {
  return makeDate(row.startYear, row.startEra === 'BCE' ? 'BCE' : 'CE', row.startMonth, row.startDay)
}

function endOf(row: DateColumnsShape): HistoricalDate | null {
  if (row.endYear == null || row.endEra == null) return null
  return makeDate(row.endYear, row.endEra === 'BCE' ? 'BCE' : 'CE', row.endMonth, row.endDay)
}

export function eventRowToForm(row: AdminEventRow): EventFormValue {
  return {
    title: row.title,
    eventTypeId: row.eventTypeId,
    start: startOf(row),
    end: endOf(row),
    ongoing: row.ongoing,
    description: row.description,
    imageUrl: row.imageUrl ?? '',
    imageCaption: row.imageCaption ?? '',
  }
}

export function epochRowToForm(row: AdminEpochRow): EpochFormValue {
  return {
    title: row.title,
    start: startOf(row),
    end: endOf(row) ?? { year: row.startYear, era: row.startEra === 'BCE' ? 'BCE' : 'CE' },
    description: row.description,
    imageUrl: row.imageUrl ?? '',
    imageCaption: row.imageCaption ?? '',
  }
}

const MONTH_NAMES = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

/** Короткая подпись даты для строк списка: «7 ноября 1917». */
export function formatDateLabel(date: HistoricalDate | null): string {
  if (!date) return '—'
  const era = date.era === 'BCE' ? ' до н. э.' : ''
  if (date.month == null) return `${date.year}${era}`
  const month = MONTH_NAMES[date.month - 1] ?? ''
  if (date.day == null) return `${month} ${date.year}${era}`
  return `${date.day} ${month} ${date.year}${era}`
}

export function formatRangeLabel(
  start: HistoricalDate,
  end: HistoricalDate | null,
  ongoing: boolean,
): string {
  if (ongoing) return `${formatDateLabel(start)} — по сей день`
  if (!end) return formatDateLabel(start)
  return `${formatDateLabel(start)} — ${formatDateLabel(end)}`
}

/** Разбор ответа маршрута: строка ошибки или null, если всё хорошо. */
export async function readError(res: Response): Promise<string | null> {
  if (res.ok) return null
  try {
    const json = (await res.json()) as { error?: string }
    return json.error ?? `Ошибка ${res.status}`
  } catch {
    return `Ошибка ${res.status}`
  }
}
