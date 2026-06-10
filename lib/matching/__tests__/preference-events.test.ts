/**
 * @jest-environment node
 */
import { recordMatchingPreferenceEvent, recordParticipantLeftEvent } from '../preference-events'

jest.mock('@/lib/db', () => ({ db: {} }))

function makeDb(participants: Array<{ joinedAt?: Date; pseudonym?: string }>) {
  const participantChain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(participants),
  }
  const insertChain = {
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([{ id: 'event-1' }]),
  }

  return {
    db: {
      select: jest.fn().mockReturnValue(participantChain),
      insert: jest.fn().mockReturnValue(insertChain),
    },
    participantChain,
    insertChain,
  }
}

describe('recordMatchingPreferenceEvent', () => {
  it('records event when target user is a participant after joined_at', async () => {
    const occurredAt = new Date('2026-06-01T12:00:00Z')
    const { db, insertChain } = makeDb([{ joinedAt: new Date('2026-06-01T11:00:00Z') }])

    const result = await recordMatchingPreferenceEvent({
      sessionId: 'session-1',
      userId: 'user-1',
      actorUserId: 'admin-1',
      eventType: 'priority_reordered',
      source: 'matching_feed',
      bookId: 'book-1',
      before: { rank: 3 },
      after: { rank: 1 },
      metadata: { reason: 'drag' },
      occurredAt,
    }, db as never)

    expect(result).toEqual({ recorded: true, eventId: 'event-1' })
    expect(insertChain.values).toHaveBeenCalledWith({
      sessionId: 'session-1',
      userId: 'user-1',
      actorUserId: 'admin-1',
      eventType: 'priority_reordered',
      source: 'matching_feed',
      bookId: 'book-1',
      before: { rank: 3 },
      after: { rank: 1 },
      metadata: { reason: 'drag' },
      occurredAt,
    })
  })

  it('does not record when target user is not a participant after joined_at', async () => {
    const { db } = makeDb([])

    const result = await recordMatchingPreferenceEvent({
      sessionId: 'session-1',
      userId: 'user-1',
      actorUserId: 'user-1',
      eventType: 'signup_added',
      source: 'matching_feed',
      occurredAt: new Date('2026-06-01T10:00:00Z'),
    }, db as never)

    expect(result).toEqual({ recorded: false, reason: 'not_participant_after_joined_at' })
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('записывает событие со skipMembershipGuard=true даже когда participant-строки нет', async () => {
    // db.select вернёт пустой массив — но гард пропускается
    const occurredAt = new Date('2026-06-01T12:00:00Z')
    const { db, insertChain, participantChain } = makeDb([])

    const result = await recordMatchingPreferenceEvent({
      sessionId: 'session-1',
      userId: 'user-1',
      actorUserId: 'user-1',
      eventType: 'participant_left',
      source: 'matching',
      occurredAt,
      skipMembershipGuard: true,
      metadata: { pseudonym: 'Белка' },
    }, db as never)

    expect(result).toEqual({ recorded: true, eventId: 'event-1' })
    // гард не вызывается — select не должен быть вызван
    expect(participantChain.from).not.toHaveBeenCalled()
    expect(insertChain.values).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'participant_left',
      metadata: { pseudonym: 'Белка' },
    }))
  })

  it('stores nullable optional fields as null', async () => {
    const occurredAt = new Date('2026-06-01T12:00:00Z')
    const { db, insertChain } = makeDb([{ joinedAt: new Date('2026-06-01T11:00:00Z') }])

    await recordMatchingPreferenceEvent({
      sessionId: 'session-1',
      userId: 'user-1',
      actorUserId: 'user-1',
      eventType: 'priority_reordered',
      source: 'matching_feed',
      occurredAt,
    }, db as never)

    expect(insertChain.values).toHaveBeenCalledWith(expect.objectContaining({
      bookId: null,
      before: null,
      after: null,
      metadata: null,
    }))
  })
})

describe('recordParticipantLeftEvent', () => {
  it('пишет событие participant_left со снимком псевдонима', async () => {
    const { db, insertChain } = makeDb([
      { pseudonym: 'Белка', joinedAt: new Date('2020-01-01T00:00:00Z') },
    ])

    await recordParticipantLeftEvent({
      sessionId: 'session-1',
      userId: 'user-1',
      actorUserId: 'admin-1',
      source: 'admin',
    }, db as never)

    expect(insertChain.values).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      userId: 'user-1',
      actorUserId: 'admin-1',
      eventType: 'participant_left',
      source: 'admin',
      metadata: { pseudonym: 'Белка' },
    }))
  })

  it('не пишет событие, если участник уже не в сессии', async () => {
    const { db } = makeDb([])

    await recordParticipantLeftEvent({
      sessionId: 'session-1',
      userId: 'user-1',
      actorUserId: 'user-1',
      source: 'matching',
    }, db as never)

    expect(db.insert).not.toHaveBeenCalled()
  })
})
