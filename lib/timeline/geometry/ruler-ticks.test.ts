import { buildRulerTicks } from './ruler-ticks';

describe('buildRulerTicks', () => {
  it('labels BCE years and leaves CE implicit without exposing astronomical year zero', () => {
    expect(buildRulerTicks({ start: -2.2, end: 2.2 }, 500)).toEqual([
      { value: -2, label: '3 BCE', major: true },
      { value: -1, label: '2 BCE', major: true },
      { value: 0, label: '1 BCE', major: true },
      { value: 1, label: '1', major: true },
      { value: 2, label: '2', major: true },
    ]);
  });

  it('subdivides a labelled step into unlabelled minor ticks', () => {
    const ticks = buildRulerTicks({ start: 1, end: 101 }, 500)
    const major = ticks.filter((tick) => tick.major)
    const minor = ticks.filter((tick) => !tick.major)

    // Подписанный шаг — 20 лет, между подписями по четыре немых засечки.
    expect(major.map((tick) => tick.value)).toEqual([20, 40, 60, 80, 100])
    expect(major.every((tick) => tick.label === String(tick.value))).toBe(true)
    expect(minor.every((tick) => tick.label === '')).toBe(true)
    expect(minor.every((tick) => tick.value % 4 === 0 && tick.value % 20 !== 0)).toBe(true)
  })

  it('keeps ticks bounded across million-year ranges', () => {
    const ticks = buildRulerTicks({ start: 0, end: 1_000_000 }, 500);

    expect(ticks.filter(({ major }) => major)).toEqual([
      { value: 0, label: '1 BCE', major: true },
      { value: 200_000, label: '200000', major: true },
      { value: 400_000, label: '400000', major: true },
      { value: 600_000, label: '600000', major: true },
      { value: 800_000, label: '800000', major: true },
      { value: 1_000_000, label: '1000000', major: true },
    ]);
    expect(ticks).toHaveLength(26);
  });
});
