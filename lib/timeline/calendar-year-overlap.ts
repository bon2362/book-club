import type { HistoricalDate } from './historical-date';

export interface HistoricalYearRange {
  start: HistoricalDate;
  end: HistoricalDate;
}

export function historicalCalendarYearOrdinal(
  date: Pick<HistoricalDate, 'year' | 'era'>,
): number {
  return date.era === 'BCE' ? -date.year : date.year - 1;
}

export function epochYearRangesConflict(
  left: HistoricalYearRange,
  right: HistoricalYearRange,
): boolean {
  const firstSharedYear = Math.max(
    historicalCalendarYearOrdinal(left.start),
    historicalCalendarYearOrdinal(right.start),
  );
  const lastSharedYear = Math.min(
    historicalCalendarYearOrdinal(left.end),
    historicalCalendarYearOrdinal(right.end),
  );

  return lastSharedYear - firstSharedYear + 1 >= 2;
}
