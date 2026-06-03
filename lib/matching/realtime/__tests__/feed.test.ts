import { appendFeed, getFeed } from '../feed'
import type { FeedScenarioSummary } from '../../feed-events'

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
})
