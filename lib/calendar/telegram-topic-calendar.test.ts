/** @jest-environment node */

jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))
jest.mock('@/lib/audit/with-audit-context', () => ({ withAuditContext: jest.fn() }))
jest.mock('@/lib/calendar/public-state', () => ({ fetchCalendarPublicState: jest.fn() }))
jest.mock('@/lib/calendar/schedule-db', () => ({ resolveScheduleBySlug: jest.fn() }))
jest.mock('@/lib/calendar/calendar-service', () => ({ saveCalendarAvailability: jest.fn() }))
jest.mock('@/lib/telegram-bot', () => {
  const actual = jest.requireActual('@/lib/telegram-bot')
  return { ...actual, editTelegramTopicMessage: jest.fn(), sendTelegramTopicMessage: jest.fn() }
})

import { withAuditContext } from '@/lib/audit/with-audit-context'
import { saveCalendarAvailability } from '@/lib/calendar/calendar-service'
import { fetchCalendarPublicState, type CalendarPublicState } from '@/lib/calendar/public-state'
import { resolveScheduleBySlug } from '@/lib/calendar/schedule-db'
import { db } from '@/lib/db'
import { editTelegramTopicMessage, sendTelegramTopicMessage } from '@/lib/telegram-bot'
import type { CalendarActor } from './calendar-actor'
import {
  bindTelegramTopic,
  buildTelegramTopicAnnouncement,
  publishTelegramTopicAnnouncement,
  toggleTelegramTopicSlot,
  type TelegramTopicBinding,
} from './telegram-topic-calendar'

const NOW = new Date('2026-11-22T10:00:00.000Z')
const member: CalendarActor = { userId: 'user-me', name: 'Евгений', isAdmin: false, source: 'telegram-bot' }
const admin: CalendarActor = { ...member, isAdmin: true }
const binding: TelegramTopicBinding = { id: 'binding-1', scheduleId: 'schedule-1', slug: 'zarya-vsego', chatId: '-100500', messageThreadId: 7, announcementMessageId: 42 }

function state(overrides: Partial<CalendarPublicState> = {}): CalendarPublicState {
  return {
    slug: 'zarya-vsego',
    book: { title: 'Заря всего', author: null },
    position: 1,
    circleExists: true,
    durationMinutes: 60,
    window: { start: '2026-11-22T10:00:00.000Z', end: '2026-12-20T10:00:00.000Z' },
    now: NOW.toISOString(),
    participants: [
      { ref: 'me', displayName: 'Евгений', timezone: null, timezoneConfirmed: false, marked: true, intervals: [
        { startsAt: '2026-11-23T08:00:00.000Z', endsAt: '2026-11-23T09:00:00.000Z' },
        { startsAt: '2026-11-25T17:00:00.000Z', endsAt: '2026-11-25T19:00:00.000Z' },
      ], busy: [] },
      { ref: 'kate', displayName: 'Катя', timezone: null, timezoneConfirmed: false, marked: false, intervals: [], busy: [] },
    ],
    meetings: [],
    viewer: { ref: 'me', canEdit: true, isAdmin: false, actingAsRef: 'me', timezone: null, timezoneConfirmed: false },
    migrationRequired: false,
    ...overrides,
  }
}

function queueBinding(rows: unknown[]) {
  const chain = { from: jest.fn().mockReturnThis(), innerJoin: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue(rows) }
  ;(db.select as jest.Mock).mockReturnValue(chain)
}

const tx = {
  insert: jest.fn(),
  update: jest.fn(),
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(withAuditContext as jest.Mock).mockImplementation((_ctx: unknown, fn: (t: unknown) => unknown) => fn(tx))
  ;(fetchCalendarPublicState as jest.Mock).mockResolvedValue(state())
  ;(saveCalendarAvailability as jest.Mock).mockResolvedValue([])
  queueBinding([{ ...binding }])
})

describe('bindTelegramTopic', () => {
  function stubInsert(returning: unknown[]) {
    const onConflictDoUpdate = jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue(returning) })
    const values = jest.fn().mockReturnValue({ onConflictDoUpdate })
    tx.insert.mockReturnValue({ values })
    return { values, onConflictDoUpdate }
  }

  it('обычный участник не может привязать или перепривязать тему', async () => {
    await expect(bindTelegramTopic({ actor: member, chatId: '-100500', messageThreadId: 7, slug: 'zarya-vsego' }))
      .rejects.toMatchObject({ code: 'not_admin' })
    expect(resolveScheduleBySlug).not.toHaveBeenCalled()
    expect(withAuditContext).not.toHaveBeenCalled()
  })

  it('неизвестный календарь не привязывается', async () => {
    ;(resolveScheduleBySlug as jest.Mock).mockResolvedValue(null)
    await expect(bindTelegramTopic({ actor: admin, chatId: '-100500', messageThreadId: 7, slug: 'nope' }))
      .rejects.toMatchObject({ code: 'schedule_not_found' })
  })

  it('администратор привязывает тему одним upsert по chat_id + thread под аудитом', async () => {
    ;(resolveScheduleBySlug as jest.Mock).mockResolvedValue({ id: 'schedule-1', slug: 'zarya-vsego', circleId: 'circle-1' })
    const { values, onConflictDoUpdate } = stubInsert([{ id: 'binding-1', announcementMessageId: 42 }])

    await expect(bindTelegramTopic({ actor: admin, chatId: '-100500', messageThreadId: 7, slug: 'zarya-vsego' }))
      .resolves.toEqual(binding)
    expect(withAuditContext).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'user-me', source: 'telegram-bot' }), expect.any(Function), expect.anything())
    expect(values).toHaveBeenCalledWith({ scheduleId: 'schedule-1', chatId: '-100500', messageThreadId: 7 })
    expect(onConflictDoUpdate).toHaveBeenCalledWith(expect.objectContaining({ set: expect.objectContaining({ scheduleId: 'schedule-1' }) }))
  })
})

describe('toggleTelegramTopicSlot', () => {
  const toggle = (overrides: Partial<Parameters<typeof toggleTelegramTopicSlot>[0]> = {}) => toggleTelegramTopicSlot({
    actor: member, bindingId: 'binding-1', chatId: '-100500', messageThreadId: 7, startsAt: new Date('2026-11-24T18:00:00.000Z'), now: NOW, ...overrides,
  })

  it('отклоняет кнопку, нажатую в другом чате или другой теме', async () => {
    await expect(toggle({ chatId: '-100999' })).rejects.toMatchObject({ code: 'wrong_topic' })
    await expect(toggle({ messageThreadId: 8 })).rejects.toMatchObject({ code: 'wrong_topic' })
    await expect(toggle({ messageThreadId: undefined })).rejects.toMatchObject({ code: 'wrong_topic' })
    expect(saveCalendarAvailability).not.toHaveBeenCalled()
  })

  it('неучастник круга не получает состояния и ничего не пишет — даже администратор сайта', async () => {
    ;(fetchCalendarPublicState as jest.Mock).mockResolvedValue(state({ viewer: { ...state().viewer, ref: null, actingAsRef: null } }))
    await expect(toggle({ actor: admin })).rejects.toMatchObject({ code: 'not_a_member' })
    expect(fetchCalendarPublicState).toHaveBeenCalledWith({ slug: 'zarya-vsego', viewerUserId: 'user-me', isAdmin: false })
    expect(saveCalendarAvailability).not.toHaveBeenCalled()
  })

  it('неизвестная привязка отклоняется', async () => {
    queueBinding([])
    await expect(toggle()).rejects.toMatchObject({ code: 'binding_not_found' })
  })

  it('добавляет один блок и сохраняет остальные интервалы пользователя', async () => {
    await expect(toggle()).resolves.toMatchObject({ action: 'added' })
    expect(saveCalendarAvailability).toHaveBeenCalledWith({
      actor: member,
      intervals: [
        { startsAt: '2026-11-23T08:00:00.000Z', endsAt: '2026-11-23T09:00:00.000Z' },
        { startsAt: '2026-11-24T18:00:00.000Z', endsAt: '2026-11-24T19:00:00.000Z' },
        { startsAt: '2026-11-25T17:00:00.000Z', endsAt: '2026-11-25T19:00:00.000Z' },
      ],
    })
  })

  it('повторное нажатие снимает только этот блок, вырезая его из длинного интервала', async () => {
    await expect(toggle({ startsAt: new Date('2026-11-25T17:00:00.000Z') })).resolves.toMatchObject({ action: 'removed' })
    expect(saveCalendarAvailability).toHaveBeenCalledWith({
      actor: member,
      intervals: [
        { startsAt: '2026-11-23T08:00:00.000Z', endsAt: '2026-11-23T09:00:00.000Z' },
        { startsAt: '2026-11-25T18:00:00.000Z', endsAt: '2026-11-25T19:00:00.000Z' },
      ],
    })
  })

  it('отклоняет прошедшее, невыровненное и за пределами окна время', async () => {
    await expect(toggle({ startsAt: new Date('2026-11-22T09:00:00.000Z') })).rejects.toMatchObject({ code: 'invalid_slot' })
    await expect(toggle({ startsAt: new Date('2026-11-24T18:10:00.000Z') })).rejects.toMatchObject({ code: 'invalid_slot' })
    await expect(toggle({ startsAt: new Date('2026-12-20T10:00:00.000Z') })).rejects.toMatchObject({ code: 'invalid_slot' })
    expect(saveCalendarAvailability).not.toHaveBeenCalled()
  })

  it('не добавляет блок поверх назначенной встречи', async () => {
    ;(fetchCalendarPublicState as jest.Mock).mockResolvedValue(state({ meetings: [{ id: 'm1', startsAt: '2026-11-24T18:30:00.000Z', durationMinutes: 60, createdByName: null, canceledAt: null }] }))
    await expect(toggle()).rejects.toMatchObject({ code: 'invalid_slot' })
  })
})

describe('buildTelegramTopicAnnouncement', () => {
  it('собирает общие счётчики, подписи по Белграду и будущие встречи', () => {
    const announcement = buildTelegramTopicAnnouncement({ binding, state: state({
      meetings: [{ id: 'm1', startsAt: '2026-11-27T18:00:00.000Z', durationMinutes: 60, createdByName: null, canceledAt: null }],
    }) })
    expect(announcement).toMatchObject({ bindingId: 'binding-1', bookTitle: 'Заря всего', mode: 'marked', markedCount: 1, participantCount: 2 })
    expect(announcement.slots[0]).toMatchObject({ label: 'Пн 23.11 09:00 CET', markedCount: 1 })
    expect(announcement.meetings).toEqual([{ startsAt: new Date('2026-11-27T18:00:00.000Z'), label: 'Пт 27.11 19:00 CET' }])
  })
})

describe('publishTelegramTopicAnnouncement', () => {
  it('редактирует существующее сообщение темы, не создавая дубль', async () => {
    ;(editTelegramTopicMessage as jest.Mock).mockResolvedValue('edited')
    await expect(publishTelegramTopicAnnouncement({ ...binding }, member)).resolves.toBe('edited')
    expect(fetchCalendarPublicState).toHaveBeenCalledWith({ slug: 'zarya-vsego', viewerUserId: null })
    expect(editTelegramTopicMessage).toHaveBeenCalledWith(expect.objectContaining({ chatId: '-100500', messageId: 42 }))
    expect(sendTelegramTopicMessage).not.toHaveBeenCalled()
  })

  it('«не изменилось» считается успешным обновлением', async () => {
    ;(editTelegramTopicMessage as jest.Mock).mockResolvedValue('not_modified')
    await expect(publishTelegramTopicAnnouncement({ ...binding }, member)).resolves.toBe('edited')
    expect(sendTelegramTopicMessage).not.toHaveBeenCalled()
  })

  it('если сообщение удалено, отправляет ровно одну замену в ту же тему и сохраняет новый id', async () => {
    ;(editTelegramTopicMessage as jest.Mock).mockResolvedValue('not_found')
    ;(sendTelegramTopicMessage as jest.Mock).mockResolvedValue(99)
    const where = jest.fn().mockResolvedValue(undefined)
    const set = jest.fn().mockReturnValue({ where })
    tx.update.mockReturnValue({ set })
    const target = { ...binding }

    await expect(publishTelegramTopicAnnouncement(target, member)).resolves.toBe('sent')
    expect(sendTelegramTopicMessage).toHaveBeenCalledTimes(1)
    expect(sendTelegramTopicMessage).toHaveBeenCalledWith(expect.objectContaining({ chatId: '-100500', messageThreadId: 7 }))
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ announcementMessageId: 99 }))
    expect(target.announcementMessageId).toBe(99)
  })

  it('прочая ошибка Telegram не плодит замен', async () => {
    ;(editTelegramTopicMessage as jest.Mock).mockResolvedValue('failed')
    await expect(publishTelegramTopicAnnouncement({ ...binding }, member)).resolves.toBe('failed')
    expect(sendTelegramTopicMessage).not.toHaveBeenCalled()
  })

  it('первая публикация отправляет сообщение и запоминает его id', async () => {
    ;(sendTelegramTopicMessage as jest.Mock).mockResolvedValue(5)
    tx.update.mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn() }) })
    await expect(publishTelegramTopicAnnouncement({ ...binding, announcementMessageId: null }, admin)).resolves.toBe('sent')
    expect(editTelegramTopicMessage).not.toHaveBeenCalled()
  })
})
