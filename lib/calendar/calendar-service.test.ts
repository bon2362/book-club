/** @jest-environment node */

jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('@/lib/audit/with-audit-context', () => ({ withAuditContext: jest.fn() }))
jest.mock('@/lib/book-analytics', () => ({ trackCalendarSlotsMarked: jest.fn(), trackCircleMeetingScheduled: jest.fn() }))

import { withAuditContext } from '@/lib/audit/with-audit-context'
import { saveCalendarAvailability } from './calendar-service'

const actor = { userId: 'user-me', name: 'Евгений', isAdmin: false, source: 'telegram-bot' as const }

describe('saveCalendarAvailability', () => {
  const values = jest.fn()
  const deleteWhere = jest.fn()
  const tx = { delete: jest.fn(() => ({ where: deleteWhere })), insert: jest.fn(() => ({ values })) }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-22T10:00:00.000Z'))
    jest.clearAllMocks()
    ;(withAuditContext as jest.Mock).mockImplementation((_ctx: unknown, fn: (t: unknown) => unknown) => fn(tx))
  })
  afterEach(() => jest.useRealTimers())

  it('пишет полный нормализованный список под аудитом с источником актора', async () => {
    const saved = await saveCalendarAvailability({ actor, intervals: [
      { startsAt: '2026-11-24T18:00:00.000Z', endsAt: '2026-11-24T19:00:00.000Z' },
      { startsAt: '2026-11-23T08:00:00.000Z', endsAt: '2026-11-23T09:00:00.000Z' },
      { startsAt: '2026-11-24T19:00:00.000Z', endsAt: '2026-11-24T20:00:00.000Z' },
    ] })
    expect(withAuditContext).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'user-me', source: 'telegram-bot' }), expect.any(Function), expect.anything())
    expect(saved.map((interval) => [interval.startsAt.toISOString(), interval.endsAt.toISOString()])).toEqual([
      ['2026-11-23T08:00:00.000Z', '2026-11-23T09:00:00.000Z'],
      ['2026-11-24T18:00:00.000Z', '2026-11-24T20:00:00.000Z'],
    ])
    expect(values).toHaveBeenCalledWith([
      { userId: 'user-me', startsAt: new Date('2026-11-23T08:00:00.000Z'), endsAt: new Date('2026-11-23T09:00:00.000Z') },
      { userId: 'user-me', startsAt: new Date('2026-11-24T18:00:00.000Z'), endsAt: new Date('2026-11-24T20:00:00.000Z') },
    ])
  })

  it('отклоняет невыровненный интервал до записи', async () => {
    await expect(saveCalendarAvailability({ actor, intervals: [{ startsAt: '2026-11-24T18:10:00.000Z', endsAt: '2026-11-24T19:00:00.000Z' }] }))
      .rejects.toMatchObject({ code: 'unaligned_interval' })
    expect(withAuditContext).not.toHaveBeenCalled()
  })
})
