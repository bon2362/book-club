import type { HistoricalDate } from '@/lib/timeline'

/**
 * Русское представление исторических дат. Формат отображения относится к
 * интерфейсу, поэтому живёт рядом с компонентами, а не в расчётном ядре.
 */

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

const MONTHS_NOMINATIVE = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

function eraSuffix(date: HistoricalDate): string {
  return date.era === 'BCE' ? ' до н. э.' : ''
}

/** Полная дата: «12 марта 1917», «март 1917» или «1917» плюс эра. */
export function formatHistoricalDate(date: HistoricalDate): string {
  if (date.month !== undefined && date.day !== undefined) {
    return `${date.day} ${MONTHS[date.month - 1]} ${date.year}${eraSuffix(date)}`
  }
  if (date.month !== undefined) {
    return `${MONTHS_NOMINATIVE[date.month - 1]} ${date.year}${eraSuffix(date)}`
  }
  return `${date.year}${eraSuffix(date)}`
}

interface DatedItem {
  start: HistoricalDate
  end?: HistoricalDate
  ongoing?: boolean
}

/** Период целиком: точка, интервал или продолжающееся событие. */
export function formatDateRange(item: DatedItem): string {
  if (item.ongoing === true) return `${formatHistoricalDate(item.start)} — по сей день`
  if (item.end === undefined) return formatHistoricalDate(item.start)
  return `${formatHistoricalDate(item.start)} — ${formatHistoricalDate(item.end)}`
}

/**
 * Короткая подпись для полотна: годы без месяцев, эра называется один раз,
 * когда концы периода в одной эре.
 */
export function formatCanvasDate(item: DatedItem): string {
  if (item.ongoing === true) return `${item.start.year}${eraSuffix(item.start)} →`
  if (item.end === undefined) return `${item.start.year}${eraSuffix(item.start)}`
  return item.end.era === item.start.era
    ? `${item.start.year} — ${item.end.year}${eraSuffix(item.start)}`
    : `${item.start.year}${eraSuffix(item.start)} — ${item.end.year}${eraSuffix(item.end)}`
}
