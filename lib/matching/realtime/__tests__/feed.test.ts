import { appendFeed, fetchFeedForSession, getFeed } from '../feed'
import type { FeedScenarioSummary } from '../../feed-events'

jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('@/lib/db/schema', () => ({
  matchingPreferenceEvents: {
    id: 'matchingPreferenceEvents.id',
    actorUserId: 'matchingPreferenceEvents.actorUserId',
    eventType: 'matchingPreferenceEvents.eventType',
    bookId: 'matchingPreferenceEvents.bookId',
    before: 'matchingPreferenceEvents.before',
    after: 'matchingPreferenceEvents.after',
    occurredAt: 'matchingPreferenceEvents.occurredAt',
    sessionId: 'matchingPreferenceEvents.sessionId',
  },
  matchingSessionParticipants: {
    sessionId: 'matchingSessionParticipants.sessionId',
    userId: 'matchingSessionParticipants.userId',
    pseudonym: 'matchingSessionParticipants.pseudonym',
  },
}))

function summary(coveredCount: number): FeedScenarioSummary {
  return {
    scenarioId: `scenario-${coveredCount}`,
    coveredCount,
    totalCount: 5,
    strongInterestCount: coveredCount,
    circleBookIds: [`book-${coveredCount}`],
    leftOutUserIds: [],
  }
}

function cause(bookId: string) {
  return {
    actor: { userId: 'u2', pseudonym: 'Кит' },
    bookId,
    mutationKind: 'book_added' as const,
    leaderBeforeId: null,
    leaderAfterId: 'scenario-1',
    at: 1,
  }
}

describe('matching realtime feed', () => {
  it('stores feed events per session in insertion order', () => {
    appendFeed('session-feed-a', {
      type: 'best',
      actor: { userId: 'u1', pseudonym: 'Лиса' },
      bookId: 'book-1',
      mutationKind: 'book_added',
      before: null,
      after: summary(3),
      addedCircleBookIds: ['book-1'],
      removedCircleBookIds: [],
    })
    appendFeed('session-feed-a', {
      type: 'leftout',
      actor: { userId: 'u2', pseudonym: 'Кит' },
      bookId: 'book-2',
      mutationKind: 'book_added',
      affected: { userId: 'u3', pseudonym: 'Белка' },
      cause: cause('book-2'),
    })

    const events = getFeed('session-feed-a')

    expect(events).toHaveLength(2)
    expect(events[0]).toEqual(expect.objectContaining({ type: 'best', bookId: 'book-1' }))
    expect(events[1]).toEqual(expect.objectContaining({ type: 'leftout', bookId: 'book-2' }))
  })

  it('keeps the latest 100 events', () => {
    for (let i = 0; i < 105; i++) {
      appendFeed('session-feed-cap', {
        type: 'best',
        actor: { userId: `u${i}`, pseudonym: `Псевдо ${i}` },
        bookId: `book-${i}`,
        mutationKind: 'book_added',
        before: null,
        after: summary(i),
        addedCircleBookIds: [`book-${i}`],
        removedCircleBookIds: [],
      })
    }

    const events = getFeed('session-feed-cap')

    expect(events).toHaveLength(100)
    expect(events[0].bookId).toBe('book-5')
    expect(events[99].bookId).toBe('book-104')
  })

  it('returns a defensive copy', () => {
    appendFeed('session-feed-copy', {
      type: 'best',
      actor: { userId: 'u1', pseudonym: 'Лиса' },
      bookId: 'book-1',
      mutationKind: 'book_added',
      before: null,
      after: summary(1),
      addedCircleBookIds: ['book-1'],
      removedCircleBookIds: [],
    })

    const events = getFeed('session-feed-copy')
    events.length = 0

    expect(getFeed('session-feed-copy')).toHaveLength(1)
  })

  it('rebuilds feed events from persistent preference events', async () => {
    const occurredAt = new Date('2026-06-03T07:00:00Z')
    const select = jest.fn()
      .mockReturnValueOnce({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{
          id: 'preference-event-1',
          actorUserId: 'u1',
          eventType: 'book_added',
          bookId: 'book-1',
          before: null,
          after: {
            id: 'scenario-1',
            tier: 'leader',
            circles: [{ id: 'circle-1', bookId: 'book-1', members: [], size: 3 }],
            leftOut: [],
            score: {
              coveredCount: 3,
              totalCount: 5,
              strongInterestCount: 2,
              avgRank: 1,
              worstRank: 2,
              unrankedCount: 0,
              rankSum: 3,
            },
          },
          occurredAt,
        }]),
      })
      .mockReturnValueOnce({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ userId: 'u1', pseudonym: 'Лиса' }]),
      })

    const events = await fetchFeedForSession('session-persistent', 100, { select } as never)

    expect(events).toEqual([
      expect.objectContaining({
        id: 1,
        ts: occurredAt.getTime(),
        type: 'best',
        actor: { userId: 'u1', pseudonym: 'Лиса' },
        bookId: 'book-1',
      }),
    ])
  })
})
