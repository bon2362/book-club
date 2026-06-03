import { fetchFeedForSession } from '../feed'

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

function scenario(coveredCount: number, leftOutUserIds: string[] = []) {
  return {
    id: `scenario-${coveredCount}-${leftOutUserIds.join('-')}`,
    tier: 'leader',
    circles: [
      {
        id: `circle-${coveredCount}`,
        bookId: `book-${coveredCount}`,
        members: [],
        minSize: 3,
        maxSize: 3,
        wantsCount: coveredCount,
        avgRank: 1,
        worstRank: 1,
        unrankedCount: 0,
      },
    ],
    leftOut: leftOutUserIds.map((userId) => ({ userId, pseudonym: userId === 'u2' ? 'Белка' : 'Кит' })),
    score: {
      coveredCount,
      totalCount: 5,
      coverageRatio: coveredCount / 5,
      strongInterestCount: coveredCount,
      rankedCount: coveredCount,
      unrankedCount: 0,
      rankSum: coveredCount,
      avgRank: 1,
      worstRank: 1,
    },
  }
}

function mockDbClient(preferenceRows: unknown[], participantRows: unknown[] = []) {
  const select = jest.fn()
    .mockReturnValueOnce({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(preferenceRows),
    })
    .mockReturnValueOnce({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(participantRows),
    })

  return { select }
}

describe('matching realtime feed', () => {
  it('returns an empty feed when there are no persistent preference events', async () => {
    const events = await fetchFeedForSession('session-empty', 100, mockDbClient([]) as never)

    expect(events).toEqual([])
  })

  it('rebuilds feed events from persistent preference events', async () => {
    const occurredAt = new Date('2026-06-03T07:00:00Z')
    const events = await fetchFeedForSession('session-persistent', 100, mockDbClient(
      [{
        id: 'preference-event-1',
        actorUserId: 'u1',
        eventType: 'book_added',
        bookId: 'book-1',
        before: null,
        after: scenario(3),
        occurredAt,
      }],
      [{ userId: 'u1', pseudonym: 'Лиса' }],
    ) as never)

    expect(events).toEqual([
      expect.objectContaining({
        id: 1,
        ts: occurredAt.getTime(),
        type: 'best',
        actor: { pseudonym: 'Лиса' },
        bookId: 'book-1',
        before: null,
        after: {
          coveredCount: 3,
          totalCount: 5,
          strongInterestCount: 3,
        },
      }),
    ])
    expect(JSON.stringify(events)).not.toContain('userId')
    expect(JSON.stringify(events)).not.toContain('leftOutUserIds')
    expect(JSON.stringify(events)).not.toContain('circleBookIds')
  })

  it('rebuilds newly-left-out events from leader snapshots', async () => {
    const occurredAt = new Date('2026-06-03T07:05:00Z')
    const events = await fetchFeedForSession('session-leftout', 100, mockDbClient(
      [{
        id: 'preference-event-2',
        actorUserId: 'u1',
        eventType: 'book_removed',
        bookId: 'book-2',
        before: scenario(4, []),
        after: scenario(3, ['u2']),
        occurredAt,
      }],
      [{ userId: 'u1', pseudonym: 'Лиса' }],
    ) as never)

    expect(events).toEqual([
      expect.objectContaining({
        type: 'leftout',
        actor: { pseudonym: 'Лиса' },
        affected: { pseudonym: 'Белка' },
        bookId: 'book-2',
        ts: occurredAt.getTime(),
      }),
    ])
    expect(JSON.stringify(events)).not.toContain('userId')
  })

  it('ignores non-feed preference events', async () => {
    const events = await fetchFeedForSession('session-ignored', 100, mockDbClient([
      {
        id: 'preference-event-3',
        actorUserId: 'u1',
        eventType: 'unknown',
        bookId: 'book-1',
        before: null,
        after: scenario(3),
        occurredAt: new Date('2026-06-03T07:10:00Z'),
      },
      {
        id: 'preference-event-4',
        actorUserId: 'u1',
        eventType: 'book_added',
        bookId: null,
        before: null,
        after: scenario(3),
        occurredAt: new Date('2026-06-03T07:11:00Z'),
      },
    ]) as never)

    expect(events).toEqual([])
  })
})
