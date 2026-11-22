import { isMissingRelationError } from '@/lib/db/errors'
import { resolveTelegramBotCalendarActor, TelegramCalendarActorError } from '@/lib/calendar/calendar-actor'
import {
  bindTelegramTopic,
  getTelegramTopicBinding,
  publishTelegramTopicAnnouncement,
  toggleTelegramTopicSlot,
  TelegramTopicError,
} from '@/lib/calendar/telegram-topic-calendar'
import {
  answerTelegramCallback,
  parseTelegramCalendarCallbackData,
  sendTelegramMessage,
  sendTelegramTopicMessage,
} from '@/lib/telegram-bot'

export type TelegramUser = { id?: number; first_name?: string; last_name?: string; username?: string; is_bot?: boolean }
export type TelegramMessage = {
  message_id?: number
  text?: string
  from?: TelegramUser
  chat?: { id?: number; type?: string }
  message_thread_id?: number
  is_topic_message?: boolean
}
export type TelegramCallbackQuery = { id?: string; from?: TelegramUser; data?: string; message?: TelegramMessage }

const CALENDAR_COMMAND = /^\/calendar(?:@([A-Za-z0-9_]+))?(?:\s+(\S+))?\s*$/i
const NOT_LINKED_TEXT = 'Сначала привяжите Telegram к аккаунту на slowreading.club: «Профиль» → «Способы входа» → Telegram.'

export function isCalendarCommand(text: string): boolean {
  return /^\/calendar(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text)
}

function configuredBotName(): string | null {
  return process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME?.replace(/^@/, '').trim().toLowerCase() || null
}

/**
 * `/calendar <slug>` внутри темы форума: только администратор сайта привязывает
 * тему к календарю круга и публикует (или обновляет) единственное сообщение.
 */
export async function handleCalendarCommand(message: TelegramMessage): Promise<void> {
  const chatId = message.chat?.id
  const fromId = message.from?.id
  if (!chatId || !fromId || message.from?.is_bot) return
  const match = (message.text ?? '').trim().match(CALENDAR_COMMAND)
  if (!match) return
  const [, mention, slug] = match
  const botName = configuredBotName()
  if (mention && botName && mention.toLowerCase() !== botName) return // команда другому боту

  const chatType = message.chat?.type
  if (chatType !== 'group' && chatType !== 'supergroup') {
    await sendTelegramMessage(chatId, 'Команда /calendar работает внутри темы группы: откройте тему книги и отправьте её там.')
    return
  }
  const threadId = message.is_topic_message ? message.message_thread_id : undefined
  if (!threadId) {
    await sendTelegramMessage(chatId, 'Отправьте /calendar <адрес календаря> внутри темы книги, а не в общем чате.')
    return
  }
  const reply = (text: string) => sendTelegramTopicMessage({ chatId: String(chatId), messageThreadId: threadId, text })
  if (!slug) {
    await reply('Укажите адрес календаря: /calendar zarya-vsego')
    return
  }

  try {
    const actor = await resolveTelegramBotCalendarActor(String(fromId))
    const binding = await bindTelegramTopic({ actor, chatId: String(chatId), messageThreadId: threadId, slug: slug.toLowerCase() })
    const outcome = await publishTelegramTopicAnnouncement(binding, actor)
    if (outcome === 'failed') await reply('Не удалось опубликовать календарь. Проверьте, что бот может писать в эту тему.')
    console.log('[telegram-webhook] topic bound', { bindingId: binding.id, outcome })
  } catch (error) {
    if (error instanceof TelegramCalendarActorError) { await reply(NOT_LINKED_TEXT); return }
    if (error instanceof TelegramTopicError) {
      const text = error.code === 'not_admin' ? 'Привязать тему к календарю может только администратор сайта.'
        : error.code === 'schedule_not_found' ? `Календарь «${slug}» не найден. Адрес — последняя часть ссылки /calendar/… на сайте.`
          : error.code === 'circle_gone' ? 'Этот круг уже распущен — привязать его нельзя.'
            : 'Не удалось привязать тему.'
      await reply(text)
      return
    }
    if (isMissingRelationError(error)) { await reply('Календарь в Telegram ещё не включён: нужна миграция базы.'); return }
    throw error
  }
}

/**
 * Нажатие быстрой кнопки. Все права проверяются на сервере: данные кнопки —
 * только адрес привязки и момент начала. Ответ нажавшему — личный toast.
 */
export async function handleCalendarCallback(callback: TelegramCallbackQuery): Promise<boolean> {
  if (!callback.id || !callback.data?.startsWith('calendar:')) return false
  const parsed = parseTelegramCalendarCallbackData(callback.data)
  const fromId = callback.from?.id
  const chatId = callback.message?.chat?.id
  if (!parsed || !fromId || !chatId) {
    await answerTelegramCallback(callback.id, 'Кнопка устарела.')
    return true
  }

  let actor
  try {
    actor = await resolveTelegramBotCalendarActor(String(fromId))
  } catch (error) {
    if (error instanceof TelegramCalendarActorError) { await answerTelegramCallback(callback.id, NOT_LINKED_TEXT, { showAlert: true }); return true }
    throw error
  }

  try {
    const { action, binding } = await toggleTelegramTopicSlot({
      actor,
      bindingId: parsed.bindingId,
      chatId: String(chatId),
      messageThreadId: callback.message?.message_thread_id,
      startsAt: parsed.startsAt,
    })
    await answerTelegramCallback(callback.id, action === 'added' ? 'Отмечено' : 'Снято')
    await publishTelegramTopicAnnouncement(binding, actor)
  } catch (error) {
    if (error instanceof TelegramTopicError) {
      if (error.code === 'not_a_member') {
        await answerTelegramCallback(callback.id, 'Отмечать время здесь могут только участники этого круга.', { showAlert: true })
      } else if (error.code === 'invalid_slot') {
        await answerTelegramCallback(callback.id, 'Это время уже недоступно — обновляю варианты.')
        const binding = await getTelegramTopicBinding(parsed.bindingId)
        if (binding && binding.chatId === String(chatId)) await publishTelegramTopicAnnouncement(binding, actor)
      } else if (error.code === 'circle_gone') {
        await answerTelegramCallback(callback.id, 'Этот круг уже распущен.', { showAlert: true })
      } else {
        await answerTelegramCallback(callback.id, 'Кнопка устарела.')
      }
      return true
    }
    if (isMissingRelationError(error)) { await answerTelegramCallback(callback.id, 'Календарь временно недоступен.'); return true }
    throw error
  }
  return true
}
