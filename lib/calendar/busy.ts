import { removeInterval } from '@/lib/calendar/availability-intervals'
import type { Interval } from '@/lib/calendar/slots'

export interface MeetingRef {
  id: string
  startsAt: Date
  durationMinutes: number
  bookTitle: string
  canceledAt: Date | null
}

export interface BusyBlock {
  meetingId: string
  startsAt: Date
  endsAt: Date
  bookTitle: string
}

export function toBusyBlocks(meetings: MeetingRef[]): BusyBlock[] {
  return meetings
    .filter((meeting) => meeting.canceledAt === null)
    .map((meeting) => ({
      meetingId: meeting.id,
      startsAt: new Date(meeting.startsAt),
      endsAt: new Date(meeting.startsAt.getTime() + meeting.durationMinutes * 60 * 1000),
      bookTitle: meeting.bookTitle,
    }))
}

export function subtractBusy(intervals: Interval[], blocks: BusyBlock[]): Interval[] {
  return blocks.reduce<Interval[]>(
    (acc, block) => removeInterval(acc, { startsAt: block.startsAt, endsAt: block.endsAt }),
    intervals,
  )
}

export function busyAt(blocks: BusyBlock[], slotStart: Date): BusyBlock | null {
  const at = slotStart.getTime()
  return blocks.find((block) => block.startsAt.getTime() <= at && at < block.endsAt.getTime()) ?? null
}
