/** @jest-environment node */
import { NextRequest } from 'next/server'
import { GET } from './route'
import { resolveTelegramCalendarActor, TelegramCalendarActorError } from '@/lib/calendar/calendar-actor'
import { fetchCalendarStateForActor } from '@/lib/calendar/calendar-service'

jest.mock('@/lib/calendar/calendar-actor', () => ({
  resolveTelegramCalendarActor: jest.fn(),
  TelegramCalendarActorError: class TelegramCalendarActorError extends Error {
    constructor(public readonly code: string) { super(code) }
  },
}))
jest.mock('@/lib/calendar/calendar-service', () => ({ fetchCalendarStateForActor: jest.fn() }))

const actor = { userId: 'user-1', name: 'Reader', isAdmin: false, source: 'telegram-miniapp' as const }
const mockActor = resolveTelegramCalendarActor as jest.Mock
const mockState = fetchCalendarStateForActor as jest.Mock

describe('GET /api/tg/calendar/[slug]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns state for a linked Telegram circle member', async () => {
    mockActor.mockResolvedValue(actor)
    mockState.mockResolvedValue({ slug: 'book-circle', viewer: { canEdit: true } })

    const response = await GET(new NextRequest('http://localhost/api/tg/calendar/book-circle'), { params: { slug: 'book-circle' } })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ slug: 'book-circle', viewer: { canEdit: true } })
    expect(mockState).toHaveBeenCalledWith({ actor, slug: 'book-circle' })
  })

  it('rejects unsigned Telegram data', async () => {
    mockActor.mockRejectedValue(new TelegramCalendarActorError('invalid_telegram_init_data'))

    const response = await GET(new NextRequest('http://localhost/api/tg/calendar/book-circle'), { params: { slug: 'book-circle' } })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'invalid_telegram_init_data' })
  })

  it('rejects a Telegram identity not linked to a club account', async () => {
    mockActor.mockRejectedValue(new TelegramCalendarActorError('telegram_identity_not_linked'))

    const response = await GET(new NextRequest('http://localhost/api/tg/calendar/book-circle'), { params: { slug: 'book-circle' } })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'telegram_identity_not_linked' })
  })
})
