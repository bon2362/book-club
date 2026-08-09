export const SLOT_MINUTES = 30
export const WINDOW_DAYS = 28
export const DEFAULT_MEETING_MINUTES = 60
export const MIN_MARKED_PARTICIPANTS = 2

const SLOT_MS = SLOT_MINUTES * 60 * 1000

export interface Interval {
  startsAt: Date
  endsAt: Date
}

export interface Window {
  start: Date
  end: Date
}

export function isSlotAligned(value: Date): boolean {
  return value.getTime() % SLOT_MS === 0
}

export function floorToSlot(value: Date): Date {
  return new Date(Math.floor(value.getTime() / SLOT_MS) * SLOT_MS)
}

export function addSlots(value: Date, count: number): Date {
  return new Date(value.getTime() + count * SLOT_MS)
}

export function slotKey(value: Date): string {
  return value.toISOString()
}

export function windowBounds(now: Date): Window {
  const start = floorToSlot(now)
  return { start, end: new Date(start.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000) }
}

export function enumerateSlots(interval: Interval): string[] {
  const keys: string[] = []
  for (let t = interval.startsAt.getTime(); t < interval.endsAt.getTime(); t += SLOT_MS) {
    keys.push(new Date(t).toISOString())
  }
  return keys
}
