/** @jest-environment node */
import { NextRequest } from 'next/server'
import { PUT } from './route'
import { resolveTelegramCalendarActor, TelegramCalendarActorError } from '@/lib/calendar/calendar-actor'
import { saveCalendarAvailabilityForActor } from '@/lib/calendar/calendar-service'
import { CalendarStateError } from '@/lib/calendar/public-state'

jest.mock('@/lib/calendar/calendar-actor', () => ({
  resolveTelegramCalendarActor: jest.fn(),
  TelegramCalendarActorError: class TelegramCalendarActorError extends Error {
    constructor(public readonly code: string) { super(code) }
  },
}))
jest.mock('@/lib/calendar/calendar-service', () => ({ saveCalendarAvailabilityForActor: jest.fn() }))
jest.mock('@/lib/calendar/public-state', () => ({
  CalendarStateError: class CalendarStateError extends Error { constructor(public readonly code: string) { super(code) } },
  isMissingCalendarSchemaError: (error: unknown) => (error as { code?: string })?.code === '42P01',
}))

const actor = { userId: 'user-1', name: 'Reader', isAdmin: false, source: 'telegram-miniapp' as const }
const mockActor = resolveTelegramCalendarActor as jest.Mock
const mockSave = saveCalendarAvailabilityForActor as jest.Mock

describe('PUT /api/tg/calendar/[slug]/availability', () => {
  beforeEach(() => jest.clearAllMocks())

  it('saves a half-hour aligned interval for a linked member', async () => {
    mockActor.mockResolvedValue(actor)
    mockSave.mockResolvedValue([{ startsAt: new Date('2026-11-22T10:00:00.000Z'), endsAt: new Date('2026-11-22T10:30:00.000Z') }])
    const response = await PUT(new NextRequest('http://localhost/api/tg/calendar/book-circle/availability', {
      method: 'PUT', body: JSON.stringify({ intervals: [{ startsAt: '2026-11-22T10:00:00.000Z', endsAt: '2026-11-22T10:30:00.000Z' }] }),
    }), { params: { slug: 'book-circle' } })

    expect(response.status).toBe(200)
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ actor, slug: 'book-circle' }))
  })

  it('rejects unsigned Telegram data before saving', async () => {
    mockActor.mockRejectedValue(new TelegramCalendarActorError('invalid_telegram_init_data'))
    const response = await PUT(new NextRequest('http://localhost/api/tg/calendar/book-circle/availability', { method: 'PUT', body: JSON.stringify({ intervals: [] }) }), { params: { slug: 'book-circle' } })
    expect(response.status).toBe(401)
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown calendar slug', async () => {
    mockActor.mockResolvedValue(actor)
    mockSave.mockRejectedValue(new CalendarStateError('schedule_not_found'))
    const response = await PUT(new NextRequest('http://localhost/api/tg/calendar/missing/availability', { method: 'PUT', body: JSON.stringify({ intervals: [] }) }), { params: { slug: 'missing' } })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'schedule_not_found' })
  })
})
