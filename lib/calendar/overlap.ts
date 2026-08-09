import { hasAnyIn } from '@/lib/calendar/availability-intervals'
import { busyAt, type BusyBlock } from '@/lib/calendar/busy'
import {
  MIN_MARKED_PARTICIPANTS, SLOT_MINUTES, addSlots, enumerateSlots, slotKey,
  type Interval, type Window,
} from '@/lib/calendar/slots'

export interface ParticipantAvailability {
  ref: string
  intervals: Interval[]
  busy: BusyBlock[]
}

export interface OverlapCell {
  slotStart: Date
  freeRefs: string[]
  busyRefs: string[]
  idleRefs: string[]
}

export interface OverlapResult {
  cells: Map<string, OverlapCell>
  markedRefs: string[]
  candidateStarts: Set<string>
  candidateCovered: Set<string>
}

export function computeOverlap(input: {
  participants: ParticipantAvailability[]
  window: Window
  now: Date
  durationMinutes: number
  circleBusy: BusyBlock[]
}): OverlapResult {
  const { participants, window, now, durationMinutes, circleBusy } = input

  const freeSets = new Map<string, Set<string>>()
  for (const participant of participants) {
    const keys = new Set<string>()
    for (const interval of participant.intervals) {
      for (const key of enumerateSlots(interval)) keys.add(key)
    }
    freeSets.set(participant.ref, keys)
  }

  const markedRefs = participants
    .filter((participant) => hasAnyIn(participant.intervals, window))
    .map((participant) => participant.ref)

  const cells = new Map<string, OverlapCell>()
  for (let slot = new Date(window.start); slot < window.end; slot = addSlots(slot, 1)) {
    const key = slotKey(slot)
    const freeRefs: string[] = []
    const busyRefs: string[] = []
    const idleRefs: string[] = []
    for (const participant of participants) {
      if (busyAt(participant.busy, slot)) busyRefs.push(participant.ref)
      else if (freeSets.get(participant.ref)?.has(key)) freeRefs.push(participant.ref)
      else idleRefs.push(participant.ref)
    }
    cells.set(key, { slotStart: new Date(slot), freeRefs, busyRefs, idleRefs })
  }

  const candidateStarts = new Set<string>()
  const candidateCovered = new Set<string>()
  const span = durationMinutes / SLOT_MINUTES

  if (markedRefs.length >= MIN_MARKED_PARTICIPANTS) {
    for (let slot = new Date(window.start); slot < window.end; slot = addSlots(slot, 1)) {
      if (slot.getTime() < now.getTime()) continue
      if (addSlots(slot, span).getTime() > window.end.getTime()) break

      let ok = true
      for (let step = 0; step < span; step += 1) {
        const stepStart = addSlots(slot, step)
        const cell = cells.get(slotKey(stepStart))
        if (!cell || busyAt(circleBusy, stepStart) || !markedRefs.every((ref) => cell.freeRefs.includes(ref))) {
          ok = false
          break
        }
      }
      if (!ok) continue

      candidateStarts.add(slotKey(slot))
      for (let step = 0; step < span; step += 1) {
        candidateCovered.add(slotKey(addSlots(slot, step)))
      }
    }
  }

  return { cells, markedRefs, candidateStarts, candidateCovered }
}
