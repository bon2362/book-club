import type { VisibleRange } from './viewport';

export interface RulerTick {
  value: number;
  label: string;
  major: boolean;
}

const TARGET_TICK_PIXELS = 100;

function formatYear(value: number): string {
  return value <= 0 ? `${1 - value} BCE` : `${value}`;
}

function niceTickStep(minimumStep: number): number {
  if (minimumStep <= 1) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(minimumStep));
  const normalizedStep = minimumStep / magnitude;
  const multiplier =
    normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 5 ? 5 : 10;

  return multiplier * magnitude;
}

/** Splits a labelled step into unlabelled subdivisions, or none if it divides badly. */
function minorStep(step: number): number | undefined {
  return step % 2 === 0 ? step / 2 : undefined;
}

/**
 * Builds readable calendar-year ruler ticks, hiding internal astronomical year
 * zero. Major ticks carry the year; minor ones only subdivide the span.
 */
export function buildRulerTicks(range: VisibleRange, pixelWidth: number): RulerTick[] {
  const minimumStep = (range.end - range.start) / Math.max(pixelWidth / TARGET_TICK_PIXELS, 1);
  const step = niceTickStep(minimumStep);
  const subdivision = minorStep(step) ?? step;
  const first = Math.ceil(range.start / subdivision) * subdivision;
  const ticks: RulerTick[] = [];

  for (let value = first; value <= range.end; value += subdivision) {
    const major = value % step === 0;
    ticks.push({ value, label: major ? formatYear(value) : '', major });
  }

  return ticks;
}
