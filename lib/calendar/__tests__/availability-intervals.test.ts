import { addInterval, clampToWindow, hasAnyIn, normalize, removeInterval } from '@/lib/calendar/availability-intervals'
import type { Interval } from '@/lib/calendar/slots'

const iv = (from: string, to: string): Interval => ({ startsAt: new Date(from), endsAt: new Date(to) })
const show = (list: Interval[]) => list.map((i) => `${i.startsAt.toISOString()}/${i.endsAt.toISOString()}`)
const D = '2026-08-09T'

describe('availability intervals', () => {
  it('sorts and merges overlaps', () => {
    const result = normalize([iv(`${D}18:00:00.000Z`, `${D}19:00:00.000Z`), iv(`${D}17:00:00.000Z`, `${D}18:30:00.000Z`)])
    expect(show(result)).toEqual([`${D}17:00:00.000Z/${D}19:00:00.000Z`])
  })

  it('merges touching intervals', () => {
    const result = normalize([iv(`${D}17:00:00.000Z`, `${D}18:00:00.000Z`), iv(`${D}18:00:00.000Z`, `${D}19:00:00.000Z`)])
    expect(show(result)).toEqual([`${D}17:00:00.000Z/${D}19:00:00.000Z`])
  })

  it('keeps separated intervals apart', () => {
    const result = normalize([iv(`${D}17:00:00.000Z`, `${D}18:00:00.000Z`), iv(`${D}19:00:00.000Z`, `${D}20:00:00.000Z`)])
    expect(result).toHaveLength(2)
  })

  it('adds a segment and absorbs neighbours', () => {
    const result = addInterval([iv(`${D}17:00:00.000Z`, `${D}18:00:00.000Z`)], iv(`${D}17:30:00.000Z`, `${D}19:00:00.000Z`))
    expect(show(result)).toEqual([`${D}17:00:00.000Z/${D}19:00:00.000Z`])
  })

  it('splits an interval in the middle', () => {
    const result = removeInterval([iv(`${D}17:00:00.000Z`, `${D}20:00:00.000Z`)], iv(`${D}18:00:00.000Z`, `${D}18:30:00.000Z`))
    expect(show(result)).toEqual([
      `${D}17:00:00.000Z/${D}18:00:00.000Z`,
      `${D}18:30:00.000Z/${D}20:00:00.000Z`,
    ])
  })

  it('cuts an edge without leaving empty intervals', () => {
    const result = removeInterval([iv(`${D}17:00:00.000Z`, `${D}18:00:00.000Z`)], iv(`${D}16:00:00.000Z`, `${D}18:00:00.000Z`))
    expect(result).toEqual([])
  })

  it('clamps to a window and drops intervals outside it', () => {
    const window = { start: new Date(`${D}12:00:00.000Z`), end: new Date(`${D}20:00:00.000Z`) }
    const result = clampToWindow([
      iv(`${D}10:00:00.000Z`, `${D}13:00:00.000Z`),
      iv(`${D}08:00:00.000Z`, `${D}09:00:00.000Z`),
      iv(`${D}19:00:00.000Z`, `${D}23:00:00.000Z`),
    ], window)
    expect(show(result)).toEqual([
      `${D}12:00:00.000Z/${D}13:00:00.000Z`,
      `${D}19:00:00.000Z/${D}20:00:00.000Z`,
    ])
  })

  it('reports whether any availability intersects the window', () => {
    const window = { start: new Date(`${D}12:00:00.000Z`), end: new Date(`${D}20:00:00.000Z`) }
    expect(hasAnyIn([iv(`${D}08:00:00.000Z`, `${D}09:00:00.000Z`)], window)).toBe(false)
    expect(hasAnyIn([iv(`${D}13:00:00.000Z`, `${D}14:00:00.000Z`)], window)).toBe(true)
  })
})
