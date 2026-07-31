import {
  epochYearRangesConflict,
  historicalCalendarYearOrdinal,
} from './calendar-year-overlap';

describe('historicalCalendarYearOrdinal', () => {
  it('orders BCE and CE continuously without a year zero', () => {
    expect(historicalCalendarYearOrdinal({ year: 1, era: 'BCE' })).toBe(-1);
    expect(historicalCalendarYearOrdinal({ year: 1, era: 'CE' })).toBe(0);
  });
});

describe('epochYearRangesConflict', () => {
  it('allows exactly one shared CE calendar year', () => {
    expect(epochYearRangesConflict(
      {
        start: { year: 24, era: 'BCE' },
        end: { year: 395, era: 'CE' },
      },
      {
        start: { year: 395, era: 'CE' },
        end: { year: 1453, era: 'CE' },
      },
    )).toBe(false);
  });

  it('rejects two shared CE calendar years', () => {
    expect(epochYearRangesConflict(
      {
        start: { year: 24, era: 'BCE' },
        end: { year: 396, era: 'CE' },
      },
      {
        start: { year: 395, era: 'CE' },
        end: { year: 1453, era: 'CE' },
      },
    )).toBe(true);
  });

  it('allows exactly one shared BCE calendar year', () => {
    expect(epochYearRangesConflict(
      {
        start: { year: 500, era: 'BCE' },
        end: { year: 395, era: 'BCE' },
      },
      {
        start: { year: 395, era: 'BCE' },
        end: { year: 300, era: 'BCE' },
      },
    )).toBe(false);
  });

  it('ignores months and rejects an overlap covering years 395 and 396', () => {
    expect(epochYearRangesConflict(
      {
        start: { year: 300, era: 'CE' },
        end: { year: 396, era: 'CE', month: 1 },
      },
      {
        start: { year: 395, era: 'CE', month: 12 },
        end: { year: 500, era: 'CE' },
      },
    )).toBe(true);
  });
});
