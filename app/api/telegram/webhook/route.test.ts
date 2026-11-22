/**
 * @jest-environment node
 *
 * Unit-тесты для POST /api/telegram/webhook (вход через nonce + привязка через link_<nonce>)
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/user-identities', () => {
  class IdentityConflictError extends Error {}
  return {
    resolveOrCreateUserFromIdentity: jest.fn(),
    linkVerifiedIdentityToUser: jest.fn(),
    IdentityConflictError,
  }
})

jest.mock('@/lib/telegram-auth', () => ({
  bindTelegramLoginNonce: jest.fn(),
  consumeTelegramPreauthToken: jest.fn(),
}))

jest.mock('@/lib/telegram-bot', () => {
  const actual = jest.requireActual('@/lib/telegram-bot')
  return {
    ...actual,
    sendTelegramMessage: jest.fn(),
    sendTelegramTopicMessage: jest.fn(),
    answerTelegramCallback: jest.fn(),
  }
})

jest.mock('@/lib/calendar/calendar-actor', () => {
  class TelegramCalendarActorError extends Error {
    constructor(public readonly code: string) { super(code) }
  }
  return { resolveTelegramBotCalendarActor: jest.fn(), TelegramCalendarActorError }
})

jest.mock('@/lib/calendar/telegram-topic-calendar', () => {
  class TelegramTopicError extends Error {
    constructor(public readonly code: string) { super(code) }
  }
  return {
    bindTelegramTopic: jest.fn(),
    getTelegramTopicBinding: jest.fn(),
    publishTelegramTopicAnnouncement: jest.fn(),
    toggleTelegramTopicSlot: jest.fn(),
    TelegramTopicError,
  }
})

jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({}),
}))

jest.mock('@/lib/db', () => ({ db: {} }))

import { resolveOrCreateUserFromIdentity, linkVerifiedIdentityToUser, IdentityConflictError } from '@/lib/user-identities'
import { bindTelegramLoginNonce, consumeTelegramPreauthToken } from '@/lib/telegram-auth'
import { answerTelegramCallback, sendTelegramMessage, sendTelegramTopicMessage, telegramCalendarCallbackData } from '@/lib/telegram-bot'
import { resolveTelegramBotCalendarActor, TelegramCalendarActorError } from '@/lib/calendar/calendar-actor'
import { bindTelegramTopic, getTelegramTopicBinding, publishTelegramTopicAnnouncement, toggleTelegramTopicSlot, TelegramTopicError } from '@/lib/calendar/telegram-topic-calendar'
import { POST } from './route'

const SECRET = 'test-webhook-secret'

function makeRequest(body: unknown, secretHeader?: string): NextRequest {
  return new NextRequest('http://localhost/api/telegram/webhook', {
    method: 'POST',
    headers: {
      'x-telegram-bot-api-secret-token': secretHeader ?? SECRET,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/telegram/webhook', () => {
  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET
    jest.clearAllMocks()
    ;(resolveOrCreateUserFromIdentity as jest.Mock).mockResolvedValue({ id: 'user-uuid' })
    ;(bindTelegramLoginNonce as jest.Mock).mockResolvedValue(undefined)
    ;(consumeTelegramPreauthToken as jest.Mock).mockResolvedValue('target-uuid')
    ;(linkVerifiedIdentityToUser as jest.Mock).mockResolvedValue({ id: 'target-uuid' })
    ;(sendTelegramMessage as jest.Mock).mockResolvedValue(undefined)
  })

  afterEach(() => { delete process.env.TELEGRAM_WEBHOOK_SECRET })

  it('неверный секрет → 401, без действий', async () => {
    const res = await POST(makeRequest({ message: { text: '/start n', from: { id: 1 } } }, 'wrong'))
    expect(res.status).toBe(401)
    expect(bindTelegramLoginNonce).not.toHaveBeenCalled()
    expect(linkVerifiedIdentityToUser).not.toHaveBeenCalled()
  })

  // ── вход ──
  it('/start <nonce> → bindLoginNonce + сообщение входа', async () => {
    const res = await POST(makeRequest({ message: { text: '/start abc-123', from: { id: 42, first_name: 'Иван', username: 'ivanp' } } }))
    expect(res.status).toBe(200)
    expect(bindTelegramLoginNonce).toHaveBeenCalledWith('abc-123', 'user-uuid')
    expect(linkVerifiedIdentityToUser).not.toHaveBeenCalled()
    expect(sendTelegramMessage).toHaveBeenCalledWith(42, expect.stringContaining('Готово'))
  })

  it('голый /start → инструкция', async () => {
    await POST(makeRequest({ message: { text: '/start', from: { id: 42 } } }))
    expect(bindTelegramLoginNonce).not.toHaveBeenCalled()
    expect(sendTelegramMessage).toHaveBeenCalledWith(42, expect.stringContaining('slowreading.club'))
  })

  // ── привязка ──
  it('/start link_<nonce> валидный → linkVerifiedIdentityToUser + успех', async () => {
    const res = await POST(makeRequest({ message: { text: '/start link_n1', from: { id: 42, first_name: 'Иван', username: 'ivanp' } } }))
    expect(res.status).toBe(200)
    expect(consumeTelegramPreauthToken).toHaveBeenCalledWith('n1')
    expect(linkVerifiedIdentityToUser).toHaveBeenCalledWith('target-uuid', 'telegram', '42', expect.objectContaining({ telegramUsername: 'ivanp' }), expect.anything())
    expect(bindTelegramLoginNonce).not.toHaveBeenCalled()
    expect(sendTelegramMessage).toHaveBeenCalledWith(42, expect.stringContaining('привязан'))
  })

  it('/start link_<nonce> устаревший (consume→null) → не привязывает', async () => {
    ;(consumeTelegramPreauthToken as jest.Mock).mockResolvedValue(null)
    await POST(makeRequest({ message: { text: '/start link_old', from: { id: 42 } } }))
    expect(linkVerifiedIdentityToUser).not.toHaveBeenCalled()
    expect(sendTelegramMessage).toHaveBeenCalledWith(42, expect.stringContaining('устарел'))
  })

  it('/start link_<nonce> конфликт → сообщение о конфликте', async () => {
    ;(linkVerifiedIdentityToUser as jest.Mock).mockRejectedValue(new IdentityConflictError('conflict'))
    await POST(makeRequest({ message: { text: '/start link_n2', from: { id: 42 } } }))
    expect(sendTelegramMessage).toHaveBeenCalledWith(42, expect.stringContaining('уже привязан'))
  })

  it('/start в группе по-прежнему не трогает календарь', async () => {
    await POST(makeRequest({ message: { text: '/start abc', from: { id: 42 }, chat: { id: -100500, type: 'supergroup' }, message_thread_id: 7, is_topic_message: true } }))
    expect(bindTelegramLoginNonce).toHaveBeenCalledWith('abc', 'user-uuid')
    expect(bindTelegramTopic).not.toHaveBeenCalled()
  })
})

describe('POST /api/telegram/webhook — календарь в теме', () => {
  const admin = { userId: 'admin-id', name: 'Евгений', isAdmin: true, source: 'telegram-bot' }
  const member = { ...admin, userId: 'kate-id', name: 'Катя', isAdmin: false }
  const binding = { id: 'binding-1', scheduleId: 's1', slug: 'zarya-vsego', chatId: '-100500', messageThreadId: 7, announcementMessageId: 42 }
  const topicMessage = (text: string, fromId = 1, extra: Record<string, unknown> = {}) => ({
    message: { message_id: 10, text, from: { id: fromId }, chat: { id: -100500, type: 'supergroup' }, message_thread_id: 7, is_topic_message: true, ...extra },
  })
  const startsAt = new Date('2026-11-24T18:00:00.000Z')
  const callback = (overrides: Record<string, unknown> = {}) => ({
    callback_query: {
      id: 'cb-1', from: { id: 2 }, data: telegramCalendarCallbackData('binding-1', startsAt),
      message: { message_id: 42, chat: { id: -100500, type: 'supergroup' }, message_thread_id: 7 },
      ...overrides,
    },
  })

  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME = 'slow_rising_bot'
    jest.clearAllMocks()
    ;(resolveTelegramBotCalendarActor as jest.Mock).mockResolvedValue(admin)
    ;(bindTelegramTopic as jest.Mock).mockResolvedValue(binding)
    ;(publishTelegramTopicAnnouncement as jest.Mock).mockResolvedValue('sent')
    ;(toggleTelegramTopicSlot as jest.Mock).mockResolvedValue({ action: 'added', binding })
  })
  afterEach(() => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET
    delete process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME
  })

  it('администратор сайта: /calendar zarya-vsego в теме привязывает тему и публикует одно сообщение', async () => {
    const res = await POST(makeRequest(topicMessage('/calendar zarya-vsego')))
    expect(res.status).toBe(200)
    expect(resolveTelegramBotCalendarActor).toHaveBeenCalledWith('1')
    expect(bindTelegramTopic).toHaveBeenCalledWith({ actor: admin, chatId: '-100500', messageThreadId: 7, slug: 'zarya-vsego' })
    expect(publishTelegramTopicAnnouncement).toHaveBeenCalledTimes(1)
    expect(publishTelegramTopicAnnouncement).toHaveBeenCalledWith(binding, admin)
    expect(bindTelegramLoginNonce).not.toHaveBeenCalled()
    expect(resolveOrCreateUserFromIdentity).not.toHaveBeenCalled()
  })

  it('понимает форму /calendar@bot и игнорирует команду другому боту', async () => {
    await POST(makeRequest(topicMessage('/calendar@slow_rising_bot zarya-vsego')))
    expect(bindTelegramTopic).toHaveBeenCalledTimes(1)
    await POST(makeRequest(topicMessage('/calendar@other_bot zarya-vsego')))
    expect(bindTelegramTopic).toHaveBeenCalledTimes(1)
  })

  it('обычный участник не может перепривязать тему — отказ, без публикации', async () => {
    ;(resolveTelegramBotCalendarActor as jest.Mock).mockResolvedValue(member)
    ;(bindTelegramTopic as jest.Mock).mockRejectedValue(new TelegramTopicError('not_admin'))
    await POST(makeRequest(topicMessage('/calendar zarya-vsego', 2)))
    expect(publishTelegramTopicAnnouncement).not.toHaveBeenCalled()
    expect(sendTelegramTopicMessage).toHaveBeenCalledWith(expect.objectContaining({ chatId: '-100500', messageThreadId: 7, text: expect.stringContaining('только администратор') }))
  })

  it('непривязанный Telegram получает инструкцию и ничего не меняет', async () => {
    ;(resolveTelegramBotCalendarActor as jest.Mock).mockRejectedValue(new TelegramCalendarActorError('telegram_identity_not_linked'))
    await POST(makeRequest(topicMessage('/calendar zarya-vsego', 3)))
    expect(bindTelegramTopic).not.toHaveBeenCalled()
    expect(sendTelegramTopicMessage).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('привяжите Telegram') }))
  })

  it('команда вне темы форума не привязывает', async () => {
    await POST(makeRequest(topicMessage('/calendar zarya-vsego', 1, { message_thread_id: undefined, is_topic_message: undefined })))
    await POST(makeRequest({ message: { text: '/calendar zarya-vsego', from: { id: 1 }, chat: { id: 1, type: 'private' } } }))
    expect(bindTelegramTopic).not.toHaveBeenCalled()
    expect(sendTelegramMessage).toHaveBeenCalledTimes(2)
  })

  it('обычные сообщения участников игнорируются', async () => {
    const res = await POST(makeRequest(topicMessage('Давайте в четверг', 2)))
    expect(res.status).toBe(200)
    expect(resolveTelegramBotCalendarActor).not.toHaveBeenCalled()
    expect(sendTelegramMessage).not.toHaveBeenCalled()
    expect(sendTelegramTopicMessage).not.toHaveBeenCalled()
  })

  it('нажатие кнопки: личный toast «Отмечено» и обновление общего сообщения', async () => {
    ;(resolveTelegramBotCalendarActor as jest.Mock).mockResolvedValue(member)
    await POST(makeRequest(callback()))
    expect(toggleTelegramTopicSlot).toHaveBeenCalledWith({ actor: member, bindingId: 'binding-1', chatId: '-100500', messageThreadId: 7, startsAt })
    expect(answerTelegramCallback).toHaveBeenCalledWith('cb-1', 'Отмечено')
    expect(publishTelegramTopicAnnouncement).toHaveBeenCalledWith(binding, member)
  })

  it('повторное нажатие: toast «Снято»', async () => {
    ;(toggleTelegramTopicSlot as jest.Mock).mockResolvedValue({ action: 'removed', binding })
    await POST(makeRequest(callback()))
    expect(answerTelegramCallback).toHaveBeenCalledWith('cb-1', 'Снято')
  })

  it('кнопка из чужого чата/темы отклоняется без обновления', async () => {
    ;(toggleTelegramTopicSlot as jest.Mock).mockRejectedValue(new TelegramTopicError('wrong_topic'))
    await POST(makeRequest(callback({ message: { message_id: 42, chat: { id: -100999 }, message_thread_id: 3 } })))
    expect(toggleTelegramTopicSlot).toHaveBeenCalledWith(expect.objectContaining({ chatId: '-100999', messageThreadId: 3 }))
    expect(answerTelegramCallback).toHaveBeenCalledWith('cb-1', 'Кнопка устарела.')
    expect(publishTelegramTopicAnnouncement).not.toHaveBeenCalled()
  })

  it('неучастник круга получает alert и ничего не пишет', async () => {
    ;(toggleTelegramTopicSlot as jest.Mock).mockRejectedValue(new TelegramTopicError('not_a_member'))
    await POST(makeRequest(callback()))
    expect(answerTelegramCallback).toHaveBeenCalledWith('cb-1', expect.stringContaining('только участники'), { showAlert: true })
    expect(publishTelegramTopicAnnouncement).not.toHaveBeenCalled()
  })

  it('непривязанный Telegram получает alert с инструкцией', async () => {
    ;(resolveTelegramBotCalendarActor as jest.Mock).mockRejectedValue(new TelegramCalendarActorError('telegram_identity_not_linked'))
    await POST(makeRequest(callback()))
    expect(toggleTelegramTopicSlot).not.toHaveBeenCalled()
    expect(answerTelegramCallback).toHaveBeenCalledWith('cb-1', expect.stringContaining('привяжите Telegram'), { showAlert: true })
  })

  it('испорченный payload не доходит до сервиса', async () => {
    await POST(makeRequest(callback({ data: 'calendar:../../x:1' })))
    expect(resolveTelegramBotCalendarActor).not.toHaveBeenCalled()
    expect(answerTelegramCallback).toHaveBeenCalledWith('cb-1', 'Кнопка устарела.')
  })

  it('устаревшее время: toast и обновление вариантов', async () => {
    ;(toggleTelegramTopicSlot as jest.Mock).mockRejectedValue(new TelegramTopicError('invalid_slot'))
    ;(getTelegramTopicBinding as jest.Mock).mockResolvedValue(binding)
    await POST(makeRequest(callback()))
    expect(answerTelegramCallback).toHaveBeenCalledWith('cb-1', expect.stringContaining('недоступно'))
    expect(publishTelegramTopicAnnouncement).toHaveBeenCalledWith(binding, admin)
  })

  it('сбой сервиса не роняет вебхук (Telegram не будет повторять апдейт)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    ;(toggleTelegramTopicSlot as jest.Mock).mockRejectedValue(new Error('db down'))
    const res = await POST(makeRequest(callback()))
    expect(res.status).toBe(200)
  })
})
