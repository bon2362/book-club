import type { TimelineEventDates } from '../types'
import { dateRangeForEvent, historicalDateToCoordinate } from './time-coordinate';
import { createViewportTransform, type VisibleRange } from './viewport';

export type EventConnectionGeometry =
  | { kind: 'point'; x: number }
  | {
      kind: 'finished-interval';
      startX: number;
      endX: number;
      startVisible: boolean;
      endVisible: boolean;
    }
  | {
      kind: 'ongoing-interval';
      startX: number;
      endX: number;
      startVisible: boolean;
    };

const within = (value: number, range: VisibleRange) =>
  value >= range.start && value <= range.end;

const clip = (value: number, width: number) =>
  Math.min(width, Math.max(0, value));

export function buildEventConnection(
  event: TimelineEventDates,
  range: VisibleRange,
  width: number,
): EventConnectionGeometry | undefined {
  const transform = createViewportTransform(range, width);
  const start = historicalDateToCoordinate(event.start);

  if (event.end === undefined && !event.ongoing) {
    if (!within(start, range)) return undefined;
    return { kind: 'point', x: transform.toX(start) };
  }

  if (event.ongoing) {
    if (start > range.end) return undefined;
    return {
      kind: 'ongoing-interval',
      startX: clip(transform.toX(start), width),
      endX: width,
      startVisible: within(start, range),
    };
  }

  const eventRange = dateRangeForEvent(event);
  if (eventRange.end < range.start || start > range.end) return undefined;
  return {
    kind: 'finished-interval',
    startX: clip(transform.toX(start), width),
    endX: clip(transform.toX(eventRange.end), width),
    startVisible: within(start, range),
    endVisible: within(eventRange.end, range),
  };
}
