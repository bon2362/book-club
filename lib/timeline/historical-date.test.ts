import {
  assertChronologicalRange,
  compareHistoricalDates,
  historicalDateSchema,
} from './historical-date';

describe('historicalDateSchema', () => {
  it('rejects year zero', () => {
    expect(() =>
      historicalDateSchema.parse({ year: 0, era: 'CE' }),
    ).toThrow();
  });

  it('rejects a day without a month', () => {
    expect(() =>
      historicalDateSchema.parse({ year: 1415, era: 'CE', day: 14 }),
    ).toThrow();
  });

  it('rejects an impossible calendar day', () => {
    expect(() =>
      historicalDateSchema.parse({
        year: 2025,
        era: 'CE',
        month: 2,
        day: 29,
      }),
    ).toThrow();
  });
});

describe('historical date ordering', () => {
  it('orders older BCE dates before newer BCE dates', () => {
    expect(
      compareHistoricalDates(
        { year: 753, era: 'BCE' },
        { year: 509, era: 'BCE' },
      ),
    ).toBeLessThan(0);
  });

  it('orders 1 BCE before 1 CE without exposing year zero', () => {
    expect(
      compareHistoricalDates(
        { year: 1, era: 'BCE' },
        { year: 1, era: 'CE' },
      ),
    ).toBeLessThan(0);
  });

  it('accepts a year-only range within the same year', () => {
    expect(() =>
      assertChronologicalRange(
        { year: 1517, era: 'CE' },
        { year: 1517, era: 'CE' },
      ),
    ).not.toThrow();
  });
});
