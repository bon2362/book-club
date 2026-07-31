import type { TimelineEventDates } from '../types'
import {
  coordinateToHistoricalDate,
  dateRangeForEvent,
  historicalDateToCoordinate,
} from './time-coordinate';

describe('historicalDateToCoordinate', () => {
  it('orders BCE and CE dates continuously without a public year zero', () => {
    const [twoBce, oneBce, oneCe, twoCe] = [
      historicalDateToCoordinate({ year: 2, era: 'BCE' }),
      historicalDateToCoordinate({ year: 1, era: 'BCE' }),
      historicalDateToCoordinate({ year: 1, era: 'CE' }),
      historicalDateToCoordinate({ year: 2, era: 'CE' }),
    ];

    expect([twoBce, oneBce, oneCe, twoCe]).toEqual([-1, 0, 1, 2]);
    expect(twoBce).toBeLessThan(oneBce);
    expect(oneBce).toBeLessThan(oneCe);
    expect(oneCe).toBeLessThan(twoCe);
  });

  it('represents partial dates at their UTC calendar start', () => {
    expect(historicalDateToCoordinate({ year: 2023, era: 'CE' })).toBe(2023);
    expect(historicalDateToCoordinate({ year: 2023, era: 'CE', month: 2 })).toBeCloseTo(
      2023 + 31 / 365,
    );
    expect(
      historicalDateToCoordinate({ year: 2023, era: 'CE', month: 2, day: 2 }),
    ).toBeCloseTo(2023 + 32 / 365);
  });

  it('round-trips a leap day and never exposes year zero', () => {
    expect(
      coordinateToHistoricalDate(
        historicalDateToCoordinate({ year: 2024, era: 'CE', month: 2, day: 29 }),
      ),
    ).toEqual({ year: 2024, era: 'CE', month: 2, day: 29 });
    expect(coordinateToHistoricalDate(0)).toEqual({ year: 1, era: 'BCE' });
    expect(coordinateToHistoricalDate(-1)).toEqual({ year: 2, era: 'BCE' });
  });

  it('keeps a coordinate immediately before a new year within its calendar year', () => {
    expect(coordinateToHistoricalDate(2023 + (365 * 86_400_000 - 0.1) / (365 * 86_400_000))).toEqual({
      year: 2023,
      era: 'CE',
      month: 12,
      day: 31,
    });
  });
});

describe('dateRangeForEvent', () => {
  it('uses an event start and end as interval endpoints', () => {
    const event = {
      start: { year: 1, era: 'BCE' },
      end: { year: 1, era: 'CE' },
      ongoing: false,
    } satisfies TimelineEventDates;

    expect(dateRangeForEvent(event)).toEqual({ start: 0, end: 1 + 364 / 365 });
  });

  it('expands a partial end date to the end of its stated calendar period', () => {
    const event = {
      start: { year: 2023, era: 'CE' },
      end: { year: 2024, era: 'CE' },
      ongoing: false,
    } satisfies TimelineEventDates;

    expect(dateRangeForEvent(event)).toEqual({
      start: 2023,
      end: 2024 + 365 / 366,
    });
  });

  it('uses the supplied current UTC day as the endpoint of an ongoing event', () => {
    const event = {
      start: { year: 1, era: 'CE' },
      end: { year: 2, era: 'CE' },
      ongoing: true,
    } satisfies TimelineEventDates;

    const range = dateRangeForEvent(event, new Date(Date.UTC(2024, 1, 29)));

    expect(range.start).toBe(1);
    expect(range.end).toBeCloseTo(2024 + 59 / 366);
  });
});
