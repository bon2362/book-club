import type { TelegramTopicAnnouncement } from '@/lib/calendar/telegram-topic-calendar'

const BOT_API = 'https://api.telegram.org'

export async function sendTelegramMessage(chatId: number | string, text: string, loginUrl?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) { console.error('[telegram-bot] no TELEGRAM_BOT_TOKEN'); return }
  try {
    const body: Record<string, unknown> = { chat_id: chatId, text }
    if (loginUrl) {
      body.reply_markup = { inline_keyboard: [[{ text: 'Войти на сайт', url: loginUrl }]] }
    }
    const res = await fetch(`${BOT_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) console.error('[telegram-bot] sendMessage failed', { status: res.status })
  } catch (e) {
    console.error('[telegram-bot] sendMessage error', { errorName: (e as Error)?.name })
  }
}

// ── Сообщения в темах форума (календарь круга) ──

export type TelegramInlineButton = { text: string; callback_data: string } | { text: string; url: string }
export type TelegramReplyMarkup = { inline_keyboard: TelegramInlineButton[][] }

type BotApiResult<T> = { ok: true; result: T } | { ok: false; status: number; description: string }

/**
 * Вызов Bot API без выброса на ответ Telegram «не ок»: вызывающему нужно
 * отличать «сообщение удалено» от «не изменилось». В лог идут только имя
 * метода и статус — не токен и не тело запроса.
 */
async function callBotApi<T>(method: string, body: Record<string, unknown>): Promise<BotApiResult<T>> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.error('[telegram-bot] no TELEGRAM_BOT_TOKEN')
    return { ok: false, status: 0, description: 'no_token' }
  }
  try {
    const res = await fetch(`${BOT_API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null) as { ok?: boolean; result?: T; description?: string } | null
    if (res.ok && json?.ok) return { ok: true, result: json.result as T }
    console.error('[telegram-bot] api call failed', { method, status: res.status })
    return { ok: false, status: res.status, description: json?.description ?? '' }
  } catch (e) {
    console.error('[telegram-bot] api call error', { method, errorName: (e as Error)?.name })
    return { ok: false, status: 0, description: 'network_error' }
  }
}

/** Отправляет сообщение в тему форума; возвращает message_id или null. */
export async function sendTelegramTopicMessage(input: {
  chatId: string
  messageThreadId: number
  text: string
  replyMarkup?: TelegramReplyMarkup
}): Promise<number | null> {
  const result = await callBotApi<{ message_id: number }>('sendMessage', {
    chat_id: input.chatId,
    message_thread_id: input.messageThreadId,
    text: input.text,
    link_preview_options: { is_disabled: true },
    ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
  })
  return result.ok ? result.result.message_id : null
}

export type TelegramEditOutcome = 'edited' | 'not_modified' | 'not_found' | 'failed'

/** Редактирует сообщение бота. «not_found» — сообщение удалено, нужна замена. */
export async function editTelegramTopicMessage(input: {
  chatId: string
  messageId: number
  text: string
  replyMarkup?: TelegramReplyMarkup
}): Promise<TelegramEditOutcome> {
  const result = await callBotApi<unknown>('editMessageText', {
    chat_id: input.chatId,
    message_id: input.messageId,
    text: input.text,
    link_preview_options: { is_disabled: true },
    ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
  })
  if (result.ok) return 'edited'
  const description = result.description.toLowerCase()
  if (description.includes('message is not modified')) return 'not_modified'
  if (description.includes('message to edit not found') || description.includes('message_id_invalid')) return 'not_found'
  return 'failed'
}

/** Личное всплывающее уведомление нажавшему кнопку. */
export async function answerTelegramCallback(callbackQueryId: string, text: string, options: { showAlert?: boolean } = {}): Promise<void> {
  await callBotApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    ...(options.showAlert ? { show_alert: true } : {}),
  })
}

export const TELEGRAM_CALENDAR_CALLBACK_PREFIX = 'calendar'
export const TELEGRAM_TOPIC_STARTAPP_PREFIX = 'calendar_'

export function telegramCalendarCallbackData(bindingId: string, startsAt: Date): string {
  return `${TELEGRAM_CALENDAR_CALLBACK_PREFIX}:${bindingId}:${Math.floor(startsAt.getTime() / 1000)}`
}

export function parseTelegramCalendarCallbackData(data: string | undefined): { bindingId: string; startsAt: Date } | null {
  const match = data?.match(/^calendar:([A-Za-z0-9-]{1,64}):(\d{9,11})$/)
  if (!match) return null
  return { bindingId: match[1], startsAt: new Date(Number(match[2]) * 1000) }
}

/** Direct Link на Main Mini App бота: Telegram откроет его поверх текущей темы. */
export function telegramTopicMiniAppLink(bindingId: string, botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME): string | null {
  const name = botName?.replace(/^@/, '').trim()
  if (!name) return null
  return `https://t.me/${name}?startapp=${TELEGRAM_TOPIC_STARTAPP_PREFIX}${bindingId}`
}

/**
 * Текст и клавиатура сообщения темы. Клавиатура одна на всю тему, поэтому в
 * подписях только общие счётчики — личная отметка приходит отдельным toast.
 */
export function renderTelegramTopicMessage(announcement: TelegramTopicAnnouncement, botName?: string): { text: string; replyMarkup: TelegramReplyMarkup } {
  const lines = [
    `📅 Согласование встречи — «${announcement.bookTitle}»`,
    '',
  ]
  for (const meeting of announcement.meetings) lines.push(`✅ Встреча назначена: ${meeting.label}`)
  if (announcement.meetings.length > 0) lines.push('')
  lines.push(
    announcement.mode === 'default'
      ? 'Пока никто не отметил время. Нажмите подходящий вариант — повторное нажатие снимает отметку.'
      : 'Варианты, которые уже отметили участники. Нажмите, чтобы присоединиться, — повторное нажатие снимает отметку.',
    `Время — по Белграду, встреча ${announcement.durationMinutes} мин. Число на кнопке — сколько человек могут в это время.`,
    `Отметились: ${announcement.markedCount} из ${announcement.participantCount}.`,
    '',
    'Нет подходящего варианта? «Полная сетка» — любое время.',
  )
  const rows: TelegramInlineButton[][] = announcement.slots.map((slot) => [{
    text: slot.markedCount > 0 ? `${slot.label} · ${slot.markedCount}` : slot.label,
    callback_data: telegramCalendarCallbackData(announcement.bindingId, slot.startsAt),
  }])
  const link = telegramTopicMiniAppLink(announcement.bindingId, botName)
  if (link) rows.push([{ text: '🗓 Полная сетка', url: link }])
  return { text: lines.join('\n'), replyMarkup: { inline_keyboard: rows } }
}
