import { eq } from 'drizzle-orm'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { addInterval, removeInterval } from '@/lib/calendar/availability-intervals'
import { saveCalendarAvailability } from '@/lib/calendar/calendar-service'
import { fetchCalendarPublicState, type CalendarPublicState } from '@/lib/calendar/public-state'
import { resolveScheduleBySlug } from '@/lib/calendar/schedule-db'
import { isSlotAligned, type Interval } from '@/lib/calendar/slots'
import { formatTelegramSlotLabel, selectTelegramQuickSlots } from '@/lib/calendar/telegram-quick-slots'
import { db } from '@/lib/db'
import { circleSchedules, telegramCalendarTopics } from '@/lib/db/schema'
import {
  editTelegramTopicMessage,
  renderTelegramTopicMessage,
  sendTelegramTopicMessage,
} from '@/lib/telegram-bot'
import type { CalendarActor } from './calendar-actor'

export class TelegramTopicError extends Error {
  constructor(public readonly code:
    | 'not_admin'
    | 'schedule_not_found'
    | 'circle_gone'
    | 'binding_not_found'
    | 'wrong_topic'
    | 'not_a_member'
    | 'invalid_slot') { super(code) }
}

export interface TelegramTopicBinding {
  id: string
  scheduleId: string
  slug: string
  chatId: string
  messageThreadId: number
  announcementMessageId: number | null
}

export interface TelegramTopicAnnouncement {
  bindingId: string
  bookTitle: string
  durationMinutes: number
  mode: 'default' | 'marked'
  markedCount: number
  participantCount: number
  slots: Array<{ startsAt: Date; endsAt: Date; markedCount: number; label: string }>
  meetings: Array<{ startsAt: Date; label: string }>
}

const BINDING_ID = /^[A-Za-z0-9-]{1,64}$/

function parseInterval(interval: { startsAt: string; endsAt: string }): Interval {
  return { startsAt: new Date(interval.startsAt), endsAt: new Date(interval.endsAt) }
}

function activeMeetings(state: CalendarPublicState): Interval[] {
  return state.meetings
    .filter((meeting) => meeting.canceledAt === null)
    .map((meeting) => {
      const startsAt = new Date(meeting.startsAt)
      return { startsAt, endsAt: new Date(startsAt.getTime() + meeting.durationMinutes * 60 * 1000) }
    })
}

/**
 * `/calendar <slug>` в теме: привязывает тему к календарю круга. Только
 * администратор сайта. Повторная команда в той же теме обновляет привязку
 * (уникальность по chat_id + message_thread_id), а не создаёт вторую.
 */
export async function bindTelegramTopic(input: {
  actor: CalendarActor
  chatId: string
  messageThreadId: number
  slug: string
}): Promise<TelegramTopicBinding> {
  if (!input.actor.isAdmin) throw new TelegramTopicError('not_admin')
  const schedule = await resolveScheduleBySlug(input.slug)
  if (!schedule) throw new TelegramTopicError('schedule_not_found')
  if (!schedule.circleId) throw new TelegramTopicError('circle_gone')
  const row = await withAuditContext({ actorUserId: input.actor.userId, actorLabel: input.actor.name, source: input.actor.source }, async (tx) => {
    const [saved] = await tx.insert(telegramCalendarTopics)
      .values({ scheduleId: schedule.id, chatId: input.chatId, messageThreadId: input.messageThreadId })
      .onConflictDoUpdate({
        target: [telegramCalendarTopics.chatId, telegramCalendarTopics.messageThreadId],
        set: { scheduleId: schedule.id, updatedAt: new Date() },
      })
      .returning({ id: telegramCalendarTopics.id, announcementMessageId: telegramCalendarTopics.announcementMessageId })
    return saved
  }, db)
  return {
    id: row.id,
    scheduleId: schedule.id,
    slug: schedule.slug,
    chatId: input.chatId,
    messageThreadId: input.messageThreadId,
    announcementMessageId: row.announcementMessageId,
  }
}

export async function getTelegramTopicBinding(id: string): Promise<TelegramTopicBinding | null> {
  if (!BINDING_ID.test(id)) return null
  const [row] = await db.select({
    id: telegramCalendarTopics.id,
    scheduleId: telegramCalendarTopics.scheduleId,
    slug: circleSchedules.slug,
    chatId: telegramCalendarTopics.chatId,
    messageThreadId: telegramCalendarTopics.messageThreadId,
    announcementMessageId: telegramCalendarTopics.announcementMessageId,
  })
    .from(telegramCalendarTopics)
    .innerJoin(circleSchedules, eq(circleSchedules.id, telegramCalendarTopics.scheduleId))
    .where(eq(telegramCalendarTopics.id, id))
    .limit(1)
  return row ?? null
}

/** Кнопку можно было скопировать в чужой чат или тему — сверяем с сохранённой привязкой. */
export function assertTelegramTopicOrigin(binding: TelegramTopicBinding, origin: { chatId: string; messageThreadId: number | null | undefined }) {
  if (binding.chatId !== origin.chatId || binding.messageThreadId !== origin.messageThreadId) {
    throw new TelegramTopicError('wrong_topic')
  }
}

/** Состояние календаря для участника именно этого круга. Админство сайта членство не заменяет. */
export async function loadTelegramTopicStateForMember(binding: TelegramTopicBinding, actor: CalendarActor): Promise<CalendarPublicState> {
  const state = await fetchCalendarPublicState({ slug: binding.slug, viewerUserId: actor.userId, isAdmin: false })
  if (!state.circleExists) throw new TelegramTopicError('circle_gone')
  if (!state.viewer.ref) throw new TelegramTopicError('not_a_member')
  return state
}

/**
 * Быстрая кнопка: добавляет или снимает ровно один блок длительности встречи.
 * Остальные интервалы пользователя сохраняются: в сохранение уходит полный
 * нормализованный список, а не один блок.
 */
export async function toggleTelegramTopicSlot(input: {
  actor: CalendarActor
  bindingId: string
  chatId: string
  messageThreadId: number | null | undefined
  startsAt: Date
  now?: Date
}): Promise<{ action: 'added' | 'removed'; binding: TelegramTopicBinding }> {
  const binding = await getTelegramTopicBinding(input.bindingId)
  if (!binding) throw new TelegramTopicError('binding_not_found')
  assertTelegramTopicOrigin(binding, { chatId: input.chatId, messageThreadId: input.messageThreadId })
  const state = await loadTelegramTopicStateForMember(binding, input.actor)

  const now = input.now ?? new Date()
  const startsAt = input.startsAt
  const endsAt = new Date(startsAt.getTime() + state.durationMinutes * 60 * 1000)
  if (Number.isNaN(startsAt.getTime()) || !isSlotAligned(startsAt) || startsAt.getTime() <= now.getTime() || endsAt > new Date(state.window.end)) {
    throw new TelegramTopicError('invalid_slot')
  }

  const viewer = state.participants.find((participant) => participant.ref === state.viewer.ref)
  const current = (viewer?.intervals ?? []).map(parseInterval)
  const block = { startsAt, endsAt }
  const covered = current.some((interval) => interval.startsAt <= startsAt && interval.endsAt >= endsAt)
  if (!covered && activeMeetings(state).some((meeting) => meeting.startsAt < endsAt && startsAt < meeting.endsAt)) {
    throw new TelegramTopicError('invalid_slot')
  }
  const next = covered ? removeInterval(current, block) : addInterval(current, block)
  await saveCalendarAvailability({
    actor: input.actor,
    intervals: next.map((interval) => ({ startsAt: interval.startsAt.toISOString(), endsAt: interval.endsAt.toISOString() })),
  })
  return { action: covered ? 'removed' : 'added', binding }
}

export function buildTelegramTopicAnnouncement(input: { binding: TelegramTopicBinding; state: CalendarPublicState }): TelegramTopicAnnouncement {
  const { state } = input
  const now = new Date(state.now)
  const meetings = activeMeetings(state)
  const selection = selectTelegramQuickSlots({
    participants: state.participants.map((participant) => ({ ref: participant.ref, intervals: participant.intervals.map(parseInterval) })),
    meetings,
    durationMinutes: state.durationMinutes,
    now,
    windowEnd: new Date(state.window.end),
  })
  return {
    bindingId: input.binding.id,
    bookTitle: state.book.title,
    durationMinutes: state.durationMinutes,
    mode: selection.mode,
    markedCount: state.participants.filter((participant) => participant.marked).length,
    participantCount: state.participants.length,
    slots: selection.slots.map((slot) => ({ startsAt: slot.startsAt, endsAt: slot.endsAt, markedCount: slot.markedCount, label: formatTelegramSlotLabel(slot.startsAt) })),
    meetings: meetings
      .filter((meeting) => meeting.endsAt > now)
      .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())
      .map((meeting) => ({ startsAt: meeting.startsAt, label: formatTelegramSlotLabel(meeting.startsAt) })),
  }
}

/**
 * Публикует или обновляет единственное сообщение темы. Если сообщение бота
 * удалили, отправляет ровно одну замену и сохраняет её message_id.
 * Сообщение общее для всей темы, поэтому состояние читается без зрителя.
 */
export async function publishTelegramTopicAnnouncement(binding: TelegramTopicBinding, actor: CalendarActor | null): Promise<'edited' | 'sent' | 'failed'> {
  const state = await fetchCalendarPublicState({ slug: binding.slug, viewerUserId: null })
  const { text, replyMarkup } = renderTelegramTopicMessage(buildTelegramTopicAnnouncement({ binding, state }))

  if (binding.announcementMessageId !== null) {
    const outcome = await editTelegramTopicMessage({ chatId: binding.chatId, messageId: binding.announcementMessageId, text, replyMarkup })
    if (outcome === 'edited' || outcome === 'not_modified') return 'edited'
    if (outcome === 'failed') return 'failed'
  }

  const messageId = await sendTelegramTopicMessage({ chatId: binding.chatId, messageThreadId: binding.messageThreadId, text, replyMarkup })
  if (messageId === null) return 'failed'
  await withAuditContext(
    actor
      ? { actorUserId: actor.userId, actorLabel: actor.name, source: actor.source }
      : { actorUserId: null, actorLabel: 'Telegram topic calendar', source: 'system' },
    async (tx) => {
      await tx.update(telegramCalendarTopics)
        .set({ announcementMessageId: messageId, updatedAt: new Date() })
        .where(eq(telegramCalendarTopics.id, binding.id))
    },
    db,
  )
  binding.announcementMessageId = messageId
  return 'sent'
}
