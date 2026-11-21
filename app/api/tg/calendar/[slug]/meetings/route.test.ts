/** @jest-environment node */
import { NextRequest } from 'next/server'
import { POST } from './route'
import { resolveTelegramCalendarActor, TelegramCalendarActorError } from '@/lib/calendar/calendar-actor'
import { createCalendarMeetingForActor, TelegramCalendarServiceError } from '@/lib/calendar/calendar-service'

jest.mock('@/lib/calendar/calendar-actor', () => ({
  resolveTelegramCalendarActor: jest.fn(),
  TelegramCalendarActorError: class TelegramCalendarActorError extends Error { constructor(public readonly code: string) { super(code) } },
}))
jest.mock('@/lib/calendar/calendar-service', () => ({
  createCalendarMeetingForActor: jest.fn(),
  TelegramCalendarServiceError: class TelegramCalendarServiceError extends Error { constructor(public readonly code: string) { super(code) } },
}))

const actor = { userId: 'user-1', name: 'Reader', isAdmin: false, source: 'telegram-miniapp' as const }
const mockActor = resolveTelegramCalendarActor as jest.Mock
const mockCreate = createCalendarMeetingForActor as jest.Mock

describe('POST /api/tg/calendar/[slug]/meetings', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates a meeting only through the shared calendar service', async () => {
    mockActor.mockResolvedValue(actor)
    mockCreate.mockResolvedValue({ id: 'meeting-1' })
    const response = await POST(new NextRequest('http://localhost/api/tg/calendar/book-circle/meetings', {
      method: 'POST', body: JSON.stringify({ startsAt: '2026-11-22T10:00:00.000Z' }),
    }), { params: { slug: 'book-circle' } })
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ ok: true, id: 'meeting-1' })
    expect(mockCreate).toHaveBeenCalledWith({ actor, slug: 'book-circle', startsAt: new Date('2026-11-22T10:00:00.000Z') })
  })

  it('rejects unsigned Telegram data', async () => {
    mockActor.mockRejectedValue(new TelegramCalendarActorError('invalid_telegram_init_data'))
    const response = await POST(new NextRequest('http://localhost/api/tg/calendar/book-circle/meetings', { method: 'POST', body: '{}' }), { params: { slug: 'book-circle' } })
    expect(response.status).toBe(401)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('returns 403 when the linked user is not a circle member', async () => {
    mockActor.mockResolvedValue(actor)
    mockCreate.mockRejectedValue(new TelegramCalendarServiceError('not_a_member'))
    const response = await POST(new NextRequest('http://localhost/api/tg/calendar/book-circle/meetings', { method: 'POST', body: JSON.stringify({ startsAt: '2026-11-22T10:00:00.000Z' }) }), { params: { slug: 'book-circle' } })
    expect(response.status).toBe(403)
  })

  it('returns 404 when the calendar slug does not exist', async () => {
    mockActor.mockResolvedValue(actor)
    mockCreate.mockRejectedValue(new TelegramCalendarServiceError('schedule_not_found'))
    const response = await POST(new NextRequest('http://localhost/api/tg/calendar/missing/meetings', { method: 'POST', body: JSON.stringify({ startsAt: '2026-11-22T10:00:00.000Z' }) }), { params: { slug: 'missing' } })
    expect(response.status).toBe(404)
  })
})
