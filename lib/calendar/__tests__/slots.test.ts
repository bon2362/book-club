import {
  SLOT_MINUTES, WINDOW_DAYS, addSlots, enumerateSlots,
  floorToSlot, isSlotAligned, slotKey, windowBounds,
} from '@/lib/calendar/slots'

const at = (iso: string) => new Date(iso)

describe('slots', () => {
  it('treats only :00 and :30 without seconds as aligned', () => {
    expect(isSlotAligned(at('2026-08-09T17:00:00.000Z'))).toBe(true)
    expect(isSlotAligned(at('2026-08-09T17:30:00.000Z'))).toBe(true)
    expect(isSlotAligned(at('2026-08-09T17:15:00.000Z'))).toBe(false)
    expect(isSlotAligned(at('2026-08-09T17:00:01.000Z'))).toBe(false)
  })

  it('floors to the previous half-hour', () => {
    expect(floorToSlot(at('2026-08-09T17:29:59.999Z')).toISOString()).toBe('2026-08-09T17:00:00.000Z')
    expect(floorToSlot(at('2026-08-09T17:30:00.000Z')).toISOString()).toBe('2026-08-09T17:30:00.000Z')
  })

  it('moves by N half-hour slots, including backwards', () => {
    expect(addSlots(at('2026-08-09T17:00:00.000Z'), 3).toISOString()).toBe('2026-08-09T18:30:00.000Z')
    expect(addSlots(at('2026-08-09T17:00:00.000Z'), -2).toISOString()).toBe('2026-08-09T16:00:00.000Z')
  })

  it('builds a window from floored now to WINDOW_DAYS ahead', () => {
    const { start, end } = windowBounds(at('2026-08-09T12:17:00.000Z'))
    expect(start.toISOString()).toBe('2026-08-09T12:00:00.000Z')
    expect(end.getTime() - start.getTime()).toBe(WINDOW_DAYS * 24 * 60 * 60 * 1000)
  })

  it('enumerates half-hour slots without the right boundary', () => {
    const keys = enumerateSlots({ startsAt: at('2026-08-09T17:00:00.000Z'), endsAt: at('2026-08-09T18:30:00.000Z') })
    expect(keys).toEqual([
      '2026-08-09T17:00:00.000Z',
      '2026-08-09T17:30:00.000Z',
      '2026-08-09T18:00:00.000Z',
    ])
  })

  it('uses ISO strings as slot keys', () => {
    expect(slotKey(at('2026-08-09T17:00:00.000Z'))).toBe('2026-08-09T17:00:00.000Z')
  })

  it('uses 30-minute slots', () => {
    expect(SLOT_MINUTES).toBe(30)
  })
})
