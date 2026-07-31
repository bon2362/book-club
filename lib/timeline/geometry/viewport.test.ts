import {
  createViewportTransform,
  fitRange,
  zoomRangeAroundPointer,
} from './viewport';

describe('createViewportTransform', () => {
  it('converts coordinates to pixels and back reversibly', () => {
    const transform = createViewportTransform({ start: 10, end: 110 }, 200);

    expect(transform.unitsPerPixel).toBe(0.5);
    expect(transform.toX(10)).toBe(0);
    expect(transform.toX(60)).toBe(100);
    expect(transform.toX(110)).toBe(200);
    expect(transform.fromX(0)).toBe(10);
    expect(transform.fromX(100)).toBe(60);
    expect(transform.fromX(200)).toBe(110);
  });
});

describe('zoomRangeAroundPointer', () => {
  it('keeps the pointer coordinate at the same relative viewport position', () => {
    expect(
      zoomRangeAroundPointer(
        { start: 0, end: 100 },
        25,
        0.5,
        { minSpan: 10, maxSpan: 1_000 },
      ),
    ).toEqual({ start: 12.5, end: 62.5 });
  });

  it('does not zoom below the configured minimum span', () => {
    expect(
      zoomRangeAroundPointer(
        { start: 0, end: 100 },
        50,
        0.01,
        { minSpan: 20, maxSpan: 1_000 },
      ),
    ).toEqual({ start: 40, end: 60 });
  });
});

describe('fitRange', () => {
  it('adds virtual padding so boundary values can be centered later', () => {
    expect(fitRange([10, 20], 0.5)).toEqual({ start: 5, end: 25 });
  });

  it('returns a finite default range for an empty timeline', () => {
    expect(fitRange([])).toEqual({ start: 0, end: 1 });
  });
});
