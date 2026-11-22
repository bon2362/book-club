/** @jest-environment node */

jest.mock('@/lib/calendar/calendar-actor', () => {
  class TelegramCalendarActorError extends Error {
    constructor(public readonly code: string) { super(code) }
  }
  return { resolveTelegramCalendarActor: jest.fn(), TelegramCalendarActorError }
})
jest.mock('@/lib/calendar/public-state', () => {
  class CalendarStateError extends Error {
    constructor(public readonly code: string) { super(code) }
  }
  return { CalendarStateError, isMissingCalendarSchemaError: (error: { code?: string }) => error?.code === '42P01' }
})
jest.mock('@/lib/calendar/telegram-topic-calendar', () => {
  class TelegramTopicError extends Error {
    constructor(public readonly code: string) { super(code) }
  }
  return {
    getTelegramTopicBinding: jest.fn(),
    loadTelegramTopicStateForMember: jest.fn(),
    publishTelegramTopicAnnouncement: jest.fn(),
    TelegramTopicError,
  }
})

import { NextRequest } from 'next/server'
import { resolveTelegramCalendarActor, TelegramCalendarActorError } from '@/lib/calendar/calendar-actor'
import { getTelegramTopicBinding, loadTelegramTopicStateForMember, publishTelegramTopicAnnouncement, TelegramTopicError } from '@/lib/calendar/telegram-topic-calendar'
import { GET, POST } from './route'

const actor = { userId: 'kate-id', name: 'Катя', isAdmin: false, source: 'telegram-miniapp' }
const binding = { id: 'binding-1', scheduleId: 's1', slug: 'zarya-vsego', chatId: '-100500', messageThreadId: 7, announcementMessageId: 42 }
const request = (method = 'GET') => new NextRequest('http://localhost/api/tg/calendar/topic/binding-1', { method, headers: { authorization: 'tma signed' } })
const params = { params: { bindingId: 'binding-1' } }

beforeEach(() => {
  jest.clearAllMocks()
  ;(resolveTelegramCalendarActor as jest.Mock).mockResolvedValue(actor)
  ;(getTelegramTopicBinding as jest.Mock).mockResolvedValue(binding)
  ;(loadTelegramTopicStateForMember as jest.Mock).mockResolvedValue({})
  ;(publishTelegramTopicAnnouncement as jest.Mock).mockResolvedValue('edited')
})

describe('GET /api/tg/calendar/topic/[bindingId]', () => {
  it('участнику круга возвращает только slug', async () => {
    const res = await GET(request(), params)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ slug: 'zarya-vsego' })
    expect(loadTelegramTopicStateForMember).toHaveBeenCalledWith(binding, actor)
  })

  it('без подписанного initData — 401', async () => {
    ;(resolveTelegramCalendarActor as jest.Mock).mockRejectedValue(new TelegramCalendarActorError('invalid_telegram_init_data'))
    const res = await GET(request(), params)
    expect(res.status).toBe(401)
    expect(getTelegramTopicBinding).not.toHaveBeenCalled()
  })

  it('непривязанный Telegram — 403', async () => {
    ;(resolveTelegramCalendarActor as jest.Mock).mockRejectedValue(new TelegramCalendarActorError('telegram_identity_not_linked'))
    expect((await GET(request(), params)).status).toBe(403)
  })

  it('неизвестная привязка — 404 без slug', async () => {
    ;(getTelegramTopicBinding as jest.Mock).mockResolvedValue(null)
    const res = await GET(request(), params)
    expect(res.status).toBe(404)
    expect(await res.json()).not.toHaveProperty('slug')
  })

  it('чужой круг — 403 без slug', async () => {
    ;(loadTelegramTopicStateForMember as jest.Mock).mockRejectedValue(new TelegramTopicError('not_a_member'))
    const res = await GET(request(), params)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'not_a_member' })
  })

  it('до миграции — 409', async () => {
    ;(getTelegramTopicBinding as jest.Mock).mockRejectedValue({ code: '42P01' })
    expect((await GET(request(), params)).status).toBe(409)
  })
})

describe('POST /api/tg/calendar/topic/[bindingId]', () => {
  it('обновляет сообщение темы после проверки участия', async () => {
    const res = await POST(request('POST'), params)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(publishTelegramTopicAnnouncement).toHaveBeenCalledWith(binding, actor)
  })

  it('неучастник не может дёргать обновление', async () => {
    ;(loadTelegramTopicStateForMember as jest.Mock).mockRejectedValue(new TelegramTopicError('not_a_member'))
    expect((await POST(request('POST'), params)).status).toBe(403)
    expect(publishTelegramTopicAnnouncement).not.toHaveBeenCalled()
  })
})
