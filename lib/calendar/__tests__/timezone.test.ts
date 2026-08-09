import {
  addLocalDays, formatInZone, localDayKey, resolveViewerTimeZone, startOfLocalDay, zoneOffsetMs,
} from '@/lib/calendar/timezone'

const BELGRADE = 'Europe/Belgrade'

describe('timezone', () => {
  it('считает летнее смещение Белграда как +2 часа', () => {
    expect(zoneOffsetMs(new Date('2026-08-09T09:00:00.000Z'), BELGRADE)).toBe(2 * 60 * 60 * 1000)
  })

  it('считает зимнее смещение Белграда как +1 час', () => {
    expect(zoneOffsetMs(new Date('2026-12-09T09:00:00.000Z'), BELGRADE)).toBe(60 * 60 * 1000)
  })

  it('находит местную полночь, а не полночь UTC', () => {
    expect(startOfLocalDay(new Date('2026-08-09T09:00:00.000Z'), BELGRADE).toISOString())
      .toBe('2026-08-08T22:00:00.000Z')
  })

  it('на моменте до местной полуночи относит время к предыдущему дню', () => {
    // 21:30 UTC = 23:30 по Белграду того же дня
    expect(startOfLocalDay(new Date('2026-08-09T21:30:00.000Z'), BELGRADE).toISOString())
      .toBe('2026-08-08T22:00:00.000Z')
    // 22:30 UTC = 00:30 следующего дня по Белграду
    expect(startOfLocalDay(new Date('2026-08-09T22:30:00.000Z'), BELGRADE).toISOString())
      .toBe('2026-08-09T22:00:00.000Z')
  })

  it('в UTC ведёт себя как обычная полночь', () => {
    expect(startOfLocalDay(new Date('2026-08-09T09:00:00.000Z'), 'UTC').toISOString())
      .toBe('2026-08-09T00:00:00.000Z')
  })

  it('прибавляет календарный день через переход на зимнее время', () => {
    // Белград переводит часы в ночь на 25 октября 2026: сутки длиной 25 часов.
    const oct25 = startOfLocalDay(new Date('2026-10-25T12:00:00.000Z'), BELGRADE)
    expect(oct25.toISOString()).toBe('2026-10-24T22:00:00.000Z')
    expect(addLocalDays(oct25, 1, BELGRADE).toISOString()).toBe('2026-10-25T23:00:00.000Z')
  })

  it('прибавление нуля дней не сдвигает полночь', () => {
    const start = startOfLocalDay(new Date('2026-08-09T09:00:00.000Z'), BELGRADE)
    expect(addLocalDays(start, 0, BELGRADE).toISOString()).toBe(start.toISOString())
  })

  it('строит ключ местной даты, а не даты UTC', () => {
    expect(localDayKey(new Date('2026-08-09T22:30:00.000Z'), BELGRADE)).toBe('2026-08-10')
    expect(localDayKey(new Date('2026-08-09T22:30:00.000Z'), 'UTC')).toBe('2026-08-09')
  })

  it('форматирует момент в нужном поясе', () => {
    expect(formatInZone(new Date('2026-08-09T15:00:00.000Z'), BELGRADE, { hour: '2-digit', minute: '2-digit' }))
      .toBe('17:00')
    expect(formatInZone(new Date('2026-08-09T15:00:00.000Z'), 'Asia/Tbilisi', { hour: '2-digit', minute: '2-digit' }))
      .toBe('19:00')
  })

  it('берёт сохранённый пояс, а при его отсутствии — браузерный', () => {
    expect(resolveViewerTimeZone('Asia/Tbilisi')).toBe('Asia/Tbilisi')
    expect(resolveViewerTimeZone(null)).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })
})
