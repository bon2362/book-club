import { z } from 'zod';

export type HistoricalEra = 'BCE' | 'CE';

export interface HistoricalDate {
  year: number;
  era: HistoricalEra;
  month?: number;
  day?: number;
}

type Boundary = 'start' | 'end';

function astronomicalYear(date: Pick<HistoricalDate, 'year' | 'era'>): number {
  return date.era === 'BCE' ? 1 - date.year : date.year;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

const historicalDateInputSchema = z
  .object({
    year: z.number().int().min(1),
    era: z.enum(['BCE', 'CE']),
    month: z.number().int().min(1).max(12).optional(),
    day: z.number().int().min(1).max(31).optional(),
  })
  .strict()
  .superRefine((date, context) => {
    if (date.day !== undefined && date.month === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['day'],
        message: 'Day requires a month',
      });
      return;
    }

    if (
      date.day !== undefined &&
      date.month !== undefined &&
      date.day > daysInMonth(astronomicalYear(date), date.month)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['day'],
        message: 'Day is not valid for the selected month',
      });
    }
  });

export const historicalDateSchema: z.ZodType<HistoricalDate> =
  historicalDateInputSchema.transform((date): HistoricalDate => {
    const historicalDate: HistoricalDate = {
      year: date.year,
      era: date.era,
    };

    if (date.month !== undefined) historicalDate.month = date.month;
    if (date.day !== undefined) historicalDate.day = date.day;

    return historicalDate;
  });

function resolvedMonth(date: HistoricalDate, boundary: Boundary): number {
  return date.month ?? (boundary === 'start' ? 1 : 12);
}

function resolvedDay(
  date: HistoricalDate,
  month: number,
  boundary: Boundary,
): number {
  return date.day ?? (boundary === 'start'
    ? 1
    : daysInMonth(astronomicalYear(date), month));
}

function compareNumbers(left: number, right: number): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function compareHistoricalDates(
  left: HistoricalDate,
  right: HistoricalDate,
  leftBoundary: Boundary = 'start',
  rightBoundary: Boundary = 'start',
): number {
  const yearComparison = compareNumbers(
    astronomicalYear(left),
    astronomicalYear(right),
  );
  if (yearComparison !== 0) return yearComparison;

  const leftMonth = resolvedMonth(left, leftBoundary);
  const rightMonth = resolvedMonth(right, rightBoundary);
  const monthComparison = compareNumbers(leftMonth, rightMonth);
  if (monthComparison !== 0) return monthComparison;

  return compareNumbers(
    resolvedDay(left, leftMonth, leftBoundary),
    resolvedDay(right, rightMonth, rightBoundary),
  );
}

export function assertChronologicalRange(
  start: HistoricalDate,
  end: HistoricalDate,
): void {
  historicalDateSchema.parse(start);
  historicalDateSchema.parse(end);

  if (compareHistoricalDates(start, end, 'start', 'end') > 0) {
    throw new Error('End date must not precede start date');
  }
}
