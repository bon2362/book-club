import { busyAt, subtractBusy, toBusyBlocks } from '@/lib/calendar/busy'
import type { Interval } from '@/lib/calendar/slots'

const D = '2026-08-09T'
const iv = (from: string, to: string): Interval => ({ startsAt: new Date(`${D}${from}`), endsAt: new Date(`${D}${to}`) })
const show = (list: Interval[]) => list.map((i) => `${i.startsAt.toISOString().slice(11, 16)}-${i.endsAt.toISOString().slice(11, 16)}`)

describe('busy', () => {
  it('turns active meetings into busy blocks and skips canceled ones', () => {
    const blocks = toBusyBlocks([
      { id: 'm1', startsAt: new Date(`${D}17:00:00.000Z`), durationMinutes: 90, bookTitle: 'Дом листьев', canceledAt: null },
      { id: 'm2', startsAt: new Date(`${D}19:00:00.000Z`), durationMinutes: 60, bookTitle: 'Игра в бисер', canceledAt: new Date() },
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].endsAt.toISOString()).toBe(`${D}18:30:00.000Z`)
    expect(blocks[0].bookTitle).toBe('Дом листьев')
  })

  it('subtracts busy time from free time', () => {
    const blocks = toBusyBlocks([
      { id: 'm1', startsAt: new Date(`${D}18:00:00.000Z`), durationMinutes: 60, bookTitle: 'Дом листьев', canceledAt: null },
    ])
    expect(show(subtractBusy([iv('17:00:00.000Z', '20:00:00.000Z')], blocks))).toEqual(['17:00-18:00', '19:00-20:00'])
  })

  it('finds the busy block for a half-hour slot and names the book', () => {
    const blocks = toBusyBlocks([
      { id: 'm1', startsAt: new Date(`${D}18:00:00.000Z`), durationMinutes: 60, bookTitle: 'Дом листьев', canceledAt: null },
    ])
    expect(busyAt(blocks, new Date(`${D}18:30:00.000Z`))?.bookTitle).toBe('Дом листьев')
    expect(busyAt(blocks, new Date(`${D}19:00:00.000Z`))).toBeNull()
  })
})
