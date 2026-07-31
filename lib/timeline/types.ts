import type { HistoricalDate } from './historical-date'

/**
 * Даты события в том объёме, в каком их читает геометрия ленты. Отдельный тип
 * не даёт расчётам зависеть от полной модели события в базе.
 */
export interface TimelineEventDates {
  start: HistoricalDate
  end?: HistoricalDate
  ongoing: boolean
}

export type { HistoricalDate, HistoricalEra } from './historical-date'
