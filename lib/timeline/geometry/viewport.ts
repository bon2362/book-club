export interface VisibleRange {
  start: number;
  end: number;
}

export interface ZoomLimits {
  minSpan: number;
  maxSpan: number;
}

/** Creates the reversible mapping between timeline coordinates and screen pixels. */
export function createViewportTransform(range: VisibleRange, width: number): {
  toX(value: number): number;
  fromX(x: number): number;
  unitsPerPixel: number;
} {
  const unitsPerPixel = (range.end - range.start) / width;

  return {
    toX: (value) => (value - range.start) / unitsPerPixel,
    fromX: (x) => range.start + x * unitsPerPixel,
    unitsPerPixel,
  };
}

/** Zooms a range while preserving the pointer's relative position inside it. */
export function zoomRangeAroundPointer(
  range: VisibleRange,
  pointerValue: number,
  factor: number,
  limits: ZoomLimits,
): VisibleRange {
  const span = range.end - range.start;
  const relativePointerPosition = (pointerValue - range.start) / span;
  const nextSpan = Math.min(
    Math.max(span * factor, limits.minSpan),
    limits.maxSpan,
  );
  const start = pointerValue - relativePointerPosition * nextSpan;

  return { start, end: start + nextSpan };
}

/** Translates a visible range without changing its scale. */
export function panRange(range: VisibleRange, delta: number): VisibleRange {
  return { start: range.start + delta, end: range.end + delta };
}

/**
 * Fits coordinates into a range with virtual space at both edges.
 * An empty timeline receives the deterministic finite range from 0 to 1.
 */
export function fitRange(
  values: number[],
  paddingRatio: number = 0.1,
): VisibleRange {
  if (values.length === 0) return { start: 0, end: 1 };

  const start = Math.min(...values);
  const end = Math.max(...values);
  const span = end - start || 1;
  const padding = span * paddingRatio;

  return { start: start - padding, end: end + padding };
}
