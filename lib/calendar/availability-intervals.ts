import type { Interval, Window } from '@/lib/calendar/slots'

export function normalize(intervals: Interval[]): Interval[] {
  const sorted = [...intervals]
    .filter((interval) => interval.endsAt.getTime() > interval.startsAt.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())

  const merged: Interval[] = []
  for (const current of sorted) {
    const last = merged.at(-1)
    if (last && current.startsAt.getTime() <= last.endsAt.getTime()) {
      if (current.endsAt.getTime() > last.endsAt.getTime()) {
        last.endsAt = new Date(current.endsAt)
      }
      continue
    }
    merged.push({ startsAt: new Date(current.startsAt), endsAt: new Date(current.endsAt) })
  }
  return merged
}

export function addInterval(intervals: Interval[], add: Interval): Interval[] {
  return normalize([...intervals, add])
}

export function removeInterval(intervals: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = []
  for (const current of normalize(intervals)) {
    const overlaps = current.startsAt < cut.endsAt && cut.startsAt < current.endsAt
    if (!overlaps) {
      out.push(current)
      continue
    }
    if (current.startsAt < cut.startsAt) {
      out.push({ startsAt: new Date(current.startsAt), endsAt: new Date(cut.startsAt) })
    }
    if (cut.endsAt < current.endsAt) {
      out.push({ startsAt: new Date(cut.endsAt), endsAt: new Date(current.endsAt) })
    }
  }
  return out
}

export function clampToWindow(intervals: Interval[], window: Window): Interval[] {
  const out: Interval[] = []
  for (const current of normalize(intervals)) {
    const startsAt = current.startsAt < window.start ? window.start : current.startsAt
    const endsAt = current.endsAt > window.end ? window.end : current.endsAt
    if (endsAt.getTime() > startsAt.getTime()) {
      out.push({ startsAt: new Date(startsAt), endsAt: new Date(endsAt) })
    }
  }
  return out
}

export function hasAnyIn(intervals: Interval[], window: Window): boolean {
  return clampToWindow(intervals, window).length > 0
}
