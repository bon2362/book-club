/** @jest-environment node */
import {
  answerTelegramCallback,
  editTelegramTopicMessage,
  parseTelegramCalendarCallbackData,
  renderTelegramTopicMessage,
  sendTelegramTopicMessage,
  telegramCalendarCallbackData,
} from './telegram-bot'

const TOKEN = 'test-bot-token'

function telegramResponse(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 300, status, json: async () => body })
}

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = TOKEN
  global.fetch = jest.fn()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN
  jest.restoreAllMocks()
})

function lastBody() {
  const [, init] = (global.fetch as jest.Mock).mock.calls.at(-1)
  return JSON.parse(init.body)
}

describe('Bot API для темы', () => {
  it('sendMessage передаёт message_thread_id темы и возвращает message_id', async () => {
    ;(global.fetch as jest.Mock).mockReturnValue(telegramResponse({ ok: true, result: { message_id: 77 } }))
    await expect(sendTelegramTopicMessage({ chatId: '-100500', messageThreadId: 7, text: 'Привет' })).resolves.toBe(77)
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`)
    expect(lastBody()).toMatchObject({ chat_id: '-100500', message_thread_id: 7, text: 'Привет' })
  })

  it('sendMessage без токена ничего не отправляет', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN
    await expect(sendTelegramTopicMessage({ chatId: '-1', messageThreadId: 1, text: 'x' })).resolves.toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('editMessageText различает «удалено», «не изменилось» и прочую ошибку', async () => {
    ;(global.fetch as jest.Mock).mockReturnValueOnce(telegramResponse({ ok: false, description: 'Bad Request: message to edit not found' }, 400))
    await expect(editTelegramTopicMessage({ chatId: '-1', messageId: 1, text: 'x' })).resolves.toBe('not_found')
    ;(global.fetch as jest.Mock).mockReturnValueOnce(telegramResponse({ ok: false, description: 'Bad Request: message is not modified: specified new message content' }, 400))
    await expect(editTelegramTopicMessage({ chatId: '-1', messageId: 1, text: 'x' })).resolves.toBe('not_modified')
    ;(global.fetch as jest.Mock).mockReturnValueOnce(telegramResponse({ ok: false, description: 'Too Many Requests' }, 429))
    await expect(editTelegramTopicMessage({ chatId: '-1', messageId: 1, text: 'x' })).resolves.toBe('failed')
    ;(global.fetch as jest.Mock).mockReturnValueOnce(telegramResponse({ ok: true, result: true }))
    await expect(editTelegramTopicMessage({ chatId: '-1', messageId: 1, text: 'x' })).resolves.toBe('edited')
  })

  it('лог ошибки не содержит токен', async () => {
    ;(global.fetch as jest.Mock).mockReturnValue(telegramResponse({ ok: false, description: 'nope' }, 400))
    await editTelegramTopicMessage({ chatId: '-1', messageId: 1, text: 'x' })
    expect(JSON.stringify((console.error as jest.Mock).mock.calls)).not.toContain(TOKEN)
  })

  it('answerCallbackQuery отправляет личный toast или alert', async () => {
    ;(global.fetch as jest.Mock).mockReturnValue(telegramResponse({ ok: true, result: true }))
    await answerTelegramCallback('cb-1', 'Отмечено')
    expect(lastBody()).toEqual({ callback_query_id: 'cb-1', text: 'Отмечено' })
    await answerTelegramCallback('cb-2', 'Нет доступа', { showAlert: true })
    expect(lastBody()).toEqual({ callback_query_id: 'cb-2', text: 'Нет доступа', show_alert: true })
  })
})

describe('callback data', () => {
  it('кодирует привязку и старт, укладываясь в 64 байта Telegram', () => {
    const data = telegramCalendarCallbackData('0f8fad5b-d9cb-469f-a165-70867728950e', new Date('2026-11-24T18:00:00.000Z'))
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64)
    expect(parseTelegramCalendarCallbackData(data)).toEqual({ bindingId: '0f8fad5b-d9cb-469f-a165-70867728950e', startsAt: new Date('2026-11-24T18:00:00.000Z') })
  })

  it('отвергает чужие и испорченные payload', () => {
    expect(parseTelegramCalendarCallbackData(undefined)).toBeNull()
    expect(parseTelegramCalendarCallbackData('other:1:2')).toBeNull()
    expect(parseTelegramCalendarCallbackData('calendar:a b:1795000000')).toBeNull()
    expect(parseTelegramCalendarCallbackData('calendar:abc:notanumber')).toBeNull()
  })
})

describe('renderTelegramTopicMessage', () => {
  const announcement = {
    bindingId: 'binding-1', bookTitle: 'Заря всего', durationMinutes: 60, mode: 'marked' as const, markedCount: 1, participantCount: 2,
    slots: [
      { startsAt: new Date('2026-11-26T18:00:00.000Z'), endsAt: new Date('2026-11-26T19:00:00.000Z'), markedCount: 2, label: 'Чт 26.11 19:00 CET' },
      { startsAt: new Date('2026-11-28T11:00:00.000Z'), endsAt: new Date('2026-11-28T12:00:00.000Z'), markedCount: 0, label: 'Сб 28.11 12:00 CET' },
    ],
    meetings: [],
  }

  it('рисует общие счётчики на кнопках и Direct Link на полную сетку', () => {
    const { text, replyMarkup } = renderTelegramTopicMessage(announcement, 'slow_rising_bot')
    expect(text).toContain('«Заря всего»')
    expect(text).toContain('Отметились: 1 из 2.')
    expect(replyMarkup.inline_keyboard).toEqual([
      [{ text: 'Чт 26.11 19:00 CET · 2', callback_data: telegramCalendarCallbackData('binding-1', announcement.slots[0].startsAt) }],
      [{ text: 'Сб 28.11 12:00 CET', callback_data: telegramCalendarCallbackData('binding-1', announcement.slots[1].startsAt) }],
      [{ text: '🗓 Полная сетка', url: 'https://t.me/slow_rising_bot?startapp=calendar_binding-1' }],
    ])
  })

  it('не содержит персональной отметки — клавиатура общая для темы', () => {
    const { replyMarkup } = renderTelegramTopicMessage(announcement, 'slow_rising_bot')
    expect(JSON.stringify(replyMarkup)).not.toMatch(/✓|✔|ваш|вы /i)
  })
})
