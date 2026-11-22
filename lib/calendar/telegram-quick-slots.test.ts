/** @jest-environment node */
import { belgradeZoneAbbreviation, formatTelegramSlotLabel, selectTelegramQuickSlots, zonedInstant } from './telegram-quick-slots'

const NOW = new Date('2026-11-22T10:00:00.000Z') // воскресенье, 11:00 в Белграде (CET)
const WINDOW_END = new Date('2026-12-20T10:00:00.000Z')
const iv = (startsAt: string, endsAt: string) => ({ startsAt: new Date(startsAt), endsAt: new Date(endsAt) })
const iso = (slots: Array<{ startsAt: Date }>) => slots.map((slot) => slot.startsAt.toISOString())

function base(overrides: Partial<Parameters<typeof selectTelegramQuickSlots>[0]> = {}) {
  return {
    participants: [{ ref: 'me', intervals: [] }, { ref: 'kate', intervals: [] }],
    meetings: [],
    durationMinutes: 60,
    now: NOW,
    windowEnd: WINDOW_END,
    viewerRef: 'me',
    ...overrides,
  }
}

describe('selectTelegramQuickSlots — базовый ритм', () => {
  it('пока никто не отметил время, даёт шесть ближайших будущих слотов вт/чт 19:00 и сб/вс 12:00 по Белграду', () => {
    const result = selectTelegramQuickSlots(base())
    expect(result.mode).toBe('default')
    expect(iso(result.slots)).toEqual([
      '2026-11-22T11:00:00.000Z', // вс 12:00 CET — сегодня, ещё впереди
      '2026-11-24T18:00:00.000Z', // вт 19:00
      '2026-11-26T18:00:00.000Z', // чт 19:00
      '2026-11-28T11:00:00.000Z', // сб 12:00
      '2026-11-29T11:00:00.000Z', // вс 12:00
      '2026-12-01T18:00:00.000Z', // вт 19:00
    ])
    expect(result.slots.every((slot) => slot.markedCount === 0 && !slot.selectedByViewer)).toBe(true)
    expect(result.slots[0].endsAt.toISOString()).toBe('2026-11-22T12:00:00.000Z')
  })

  it('не показывает уже начавшийся сегодняшний слот', () => {
    const result = selectTelegramQuickSlots(base({ now: new Date('2026-11-22T11:00:00.000Z') }))
    expect(iso(result.slots)[0]).toBe('2026-11-24T18:00:00.000Z')
  })

  it('держится местного времени через переход на летнее время (CEST)', () => {
    const result = selectTelegramQuickSlots(base({ now: new Date('2027-03-26T12:00:00.000Z'), windowEnd: new Date('2027-04-20T00:00:00.000Z') }))
    // сб 27.03 ещё CET (11:00Z), вс 28.03 уже CEST (10:00Z), вт 30.03 19:00 CEST = 17:00Z
    expect(iso(result.slots).slice(0, 3)).toEqual(['2027-03-27T11:00:00.000Z', '2027-03-28T10:00:00.000Z', '2027-03-30T17:00:00.000Z'])
  })

  it('исключает базовый слот, пересекающий назначенную встречу круга', () => {
    const result = selectTelegramQuickSlots(base({ meetings: [iv('2026-11-24T17:30:00.000Z', '2026-11-24T18:30:00.000Z')] }))
    expect(iso(result.slots)).not.toContain('2026-11-24T18:00:00.000Z')
    expect(result.slots).toHaveLength(6)
  })
})

describe('selectTelegramQuickSlots — после первой отметки', () => {
  it('заменяет базовые слоты реальными интервалами участников', () => {
    const result = selectTelegramQuickSlots(base({
      participants: [{ ref: 'me', intervals: [] }, { ref: 'kate', intervals: [iv('2026-11-25T17:00:00.000Z', '2026-11-25T18:00:00.000Z')] }],
    }))
    expect(result.mode).toBe('marked')
    expect(iso(result.slots)).toEqual(['2026-11-25T17:00:00.000Z'])
    expect(result.slots[0]).toMatchObject({ markedCount: 1, selectedByViewer: false })
  })

  it('сортирует по числу отметивших, затем по близости, и обрезает до шести', () => {
    const result = selectTelegramQuickSlots(base({
      participants: [
        { ref: 'me', intervals: [iv('2026-11-23T08:00:00.000Z', '2026-11-23T12:00:00.000Z'), iv('2026-11-27T10:00:00.000Z', '2026-11-27T11:00:00.000Z')] },
        { ref: 'kate', intervals: [iv('2026-11-27T10:00:00.000Z', '2026-11-27T11:00:00.000Z')] },
      ],
    }))
    expect(iso(result.slots)).toEqual([
      '2026-11-27T10:00:00.000Z', // двое
      '2026-11-23T08:00:00.000Z',
      '2026-11-23T08:30:00.000Z',
      '2026-11-23T09:00:00.000Z',
      '2026-11-23T09:30:00.000Z',
      '2026-11-23T10:00:00.000Z',
    ])
    expect(result.slots[0]).toMatchObject({ markedCount: 2, selectedByViewer: true })
  })

  it('не предлагает блок короче длительности встречи и не склеивает чужие половинки', () => {
    const result = selectTelegramQuickSlots(base({
      durationMinutes: 90,
      participants: [
        { ref: 'me', intervals: [iv('2026-11-23T08:00:00.000Z', '2026-11-23T09:00:00.000Z')] },
        { ref: 'kate', intervals: [iv('2026-11-23T09:00:00.000Z', '2026-11-23T10:30:00.000Z')] },
      ],
    }))
    expect(iso(result.slots)).toEqual(['2026-11-23T09:00:00.000Z'])
    expect(result.slots[0].endsAt.toISOString()).toBe('2026-11-23T10:30:00.000Z')
  })

  it('исключает прошедшие старты и блоки, пересекающие встречу', () => {
    const result = selectTelegramQuickSlots(base({
      participants: [{ ref: 'me', intervals: [iv('2026-11-22T09:00:00.000Z', '2026-11-22T11:30:00.000Z'), iv('2026-11-24T18:00:00.000Z', '2026-11-24T20:00:00.000Z')] }],
      meetings: [iv('2026-11-24T19:00:00.000Z', '2026-11-24T20:00:00.000Z')],
    }))
    expect(iso(result.slots)).toEqual(['2026-11-22T10:30:00.000Z', '2026-11-24T18:00:00.000Z'])
  })

  it('если отмеченное целиком занято встречей, возвращает базовые кнопки', () => {
    const result = selectTelegramQuickSlots(base({
      participants: [{ ref: 'me', intervals: [iv('2026-11-24T18:00:00.000Z', '2026-11-24T19:00:00.000Z')] }],
      meetings: [iv('2026-11-24T18:00:00.000Z', '2026-11-24T19:00:00.000Z')],
    }))
    expect(result.mode).toBe('default')
    expect(iso(result.slots)).not.toContain('2026-11-24T18:00:00.000Z')
  })
})

describe('подписи', () => {
  it('пишет день, дату, время и CET/CEST по Белграду', () => {
    expect(formatTelegramSlotLabel(new Date('2026-11-26T18:00:00.000Z'))).toBe('Чт 26.11 19:00 CET')
    expect(formatTelegramSlotLabel(new Date('2027-06-05T10:00:00.000Z'))).toBe('Сб 05.06 12:00 CEST')
    expect(belgradeZoneAbbreviation(new Date('2027-06-05T10:00:00.000Z'))).toBe('CEST')
  })

  it('zonedInstant переводит местные часы в момент UTC', () => {
    expect(zonedInstant(2026, 11, 24, 19, 0, 'Europe/Belgrade').toISOString()).toBe('2026-11-24T18:00:00.000Z')
    expect(zonedInstant(2027, 7, 1, 19, 0, 'Europe/Belgrade').toISOString()).toBe('2027-07-01T17:00:00.000Z')
  })
})
