/**
 * @jest-environment node
 */
import { recordMatchingPreferenceEvent } from '../preference-events'

jest.mock('@/lib/db', () => ({ db: {} }))

function makeDb(participants: Array<{ joinedAt: Date }>) {
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
