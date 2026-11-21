/** @jest-environment node */

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
  },
}))

import { createHmac } from 'crypto'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { TelegramCalendarActorError, resolveTelegramCalendarActor } from './calendar-actor'

const BOT_TOKEN = 'test-mini-app-bot-token'

function signedInitData(telegramUserId = '900100200') {
  const params = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAH-test-query',
    user: JSON.stringify({ id: Number(telegramUserId), first_name: 'Тест', username: 'reader' }),
  }
  const dataCheckString = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex')
  return new URLSearchParams({ ...params, hash }).toString()
}

function request(telegramUserId?: string) {
  return new NextRequest('http://localhost/api/tg/calendar/book-circle', {
    headers: { authorization: `tma ${signedInitData(telegramUserId)}` },
  })
}

function queueIdentity(rows: unknown[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  }
  ;(db.select as jest.Mock).mockReturnValue(chain)
  return chain
}

describe('resolveTelegramCalendarActor', () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN
    jest.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN
  })

  it('maps signed Mini App data to an existing Telegram identity without creating a user', async () => {
    const query = queueIdentity([{ userId: 'club-user', name: 'Reader', isAdmin: false }])

    await expect(resolveTelegramCalendarActor(request())).resolves.toEqual({
      userId: 'club-user', name: 'Reader', isAdmin: false, source: 'telegram-miniapp',
    })

    expect(query.where).toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('rejects signed data whose Telegram identity is not linked to a club user', async () => {
    queueIdentity([])

    await expect(resolveTelegramCalendarActor(request('777')))
      .rejects.toMatchObject({ code: 'telegram_identity_not_linked' } satisfies Partial<TelegramCalendarActorError>)

    expect(db.insert).not.toHaveBeenCalled()
  })
})
