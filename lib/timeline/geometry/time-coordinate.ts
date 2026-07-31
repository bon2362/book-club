import type { HistoricalDate, TimelineEventDates } from '../types'

/**
 * Converts the public BCE/CE convention to astronomical numbering. Astronomical
 * year zero is internal only: it represents 1 BCE.
 */
function toAstronomicalYear(date: Pick<HistoricalDate, 'year' | 'era'>): number {
  return date.era === 'BCE' ? 1 - date.year : date.year;
}

function fromAstronomicalYear(year: number): Pick<HistoricalDate, 'year' | 'era'> {
  return year <= 0
    ? { year: 1 - year, era: 'BCE' }
    : { year, era: 'CE' };
}

function utcCalendarTime(year: number, month: number, day: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

/** Maps a historical date to a continuous, year-based timeline coordinate. */
export function historicalDateToCoordinate(date: HistoricalDate): number {
  const year = toAstronomicalYear(date);
  const startOfYear = utcCalendarTime(year, 0, 1);
  const startOfNextYear = utcCalendarTime(year + 1, 0, 1);
  const month = (date.month ?? 1) - 1;
  const day = date.day ?? 1;
  const calendarTime = utcCalendarTime(year, month, day);

  return year + (calendarTime - startOfYear) / (startOfNextYear - startOfYear);
}

/** Converts a coordinate back to a public HistoricalDate without year zero. */
export function coordinateToHistoricalDate(value: number): HistoricalDate {
  const year = Math.floor(value);
  const fraction = value - year;
  const publicYear = fromAstronomicalYear(year);

  if (fraction === 0) return publicYear;

  const startOfYear = utcCalendarTime(year, 0, 1);
  const startOfNextYear = utcCalendarTime(year + 1, 0, 1);
  const yearDuration = startOfNextYear - startOfYear;
  const calendarDate = new Date(
    startOfYear + Math.min(Math.round(fraction * yearDuration), yearDuration - 1),
  );

  return {
    ...publicYear,
    month: calendarDate.getUTCMonth() + 1,
    day: calendarDate.getUTCDate(),
  };
}

function historicalDateFromUtcDate(date: Date): HistoricalDate {
  const year = date.getUTCFullYear();

  return {
    ...fromAstronomicalYear(year),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function endBoundaryDate(date: HistoricalDate): HistoricalDate {
  const year = toAstronomicalYear(date);
  const month = date.month ?? 12;
  const day = date.day ?? new Date(utcCalendarTime(year, month, 0)).getUTCDate();

  return { ...date, month, day };
}

/** Returns the displayed coordinate interval for a point, interval, or ongoing event. */
export function dateRangeForEvent(
  event: TimelineEventDates,
  now: Date = new Date(),
): { start: number; end: number } {
  return {
    start: historicalDateToCoordinate(event.start),
    end: historicalDateToCoordinate(
      event.ongoing
        ? historicalDateFromUtcDate(now)
        : event.end
          ? endBoundaryDate(event.end)
          : event.start,
    ),
  };
}
