import {
  buildFeedEventsForMutation,
  hasLeaderChanged,
  isMatchingMutationKind,
  newlyLeftOut,
  summarizeLeader,
} from '../feed-events'
import type { MatchingCircle, MatchingScenario } from '../scenarios'

function circle(bookId: string, userIds: string[]): MatchingCircle {
  return {
    id: `${bookId}:${userIds.join('+')}`,
    bookId,
    members: userIds.map((userId, index) => ({
      userId,
      pseudonym: `User ${index + 1}`,
      rank: index + 1,
      interest: 'очень хочу',
    })),
    minSize: 3,
    maxSize: 3,
    wantsCount: userIds.length,
    avgRank: 2,
    worstRank: 3,
    unrankedCount: 0,
  }
}

function scenario(
  id: string,
  circles: MatchingCircle[],
  leftOut: { userId: string; pseudonym: string }[] = [],
): MatchingScenario {
  const coveredCount = new Set(circles.flatMap((item) => item.members.map((member) => member.userId))).size
  return {
    id,
    tier: 'leader',
    circles,
    leftOut,
    score: {
      coveredCount,
      totalCount: coveredCount + leftOut.length,
      coverageRatio: coveredCount / (coveredCount + leftOut.length),
      strongInterestCount: coveredCount,
      rankedCount: coveredCount,
      unrankedCount: 0,
      rankSum: coveredCount,
      avgRank: 2,
      worstRank: 3,
    },
  }
}

const actor = { userId: 'actor', pseudonym: 'Actor' }

describe('isMatchingMutationKind', () => {
  it('принимает participant_left как валидный тип мутации', () => {
    expect(isMatchingMutationKind('participant_left')).toBe(true)
  })

  it('принимает все стандартные типы мутаций', () => {
    for (const kind of ['book_added', 'book_removed', 'rank_changed', 'status_changed', 'catalog_signup_updated', 'priorities_updated']) {
      expect(isMatchingMutationKind(kind)).toBe(true)
    }
  })

  it('отклоняет неизвестные значения', () => {
    expect(isMatchingMutationKind('unknown_kind')).toBe(false)
    expect(isMatchingMutationKind('')).toBe(false)
  })
})

describe('feed event detection', () => {
  it('emits a best event when the leader scenario changes', () => {
    const before = scenario('before', [circle('book-a', ['u1', 'u2', 'u3'])], [
      { userId: 'u4', pseudonym: 'User 4' },
    ])
    const after = scenario('after', [circle('book-b', ['u1', 'u2', 'u3']), circle('book-c', ['u4', 'u5', 'u6'])])

    const events = buildFeedEventsForMutation({
      actor,
      bookId: 'book-b',
      kind: 'book_added',
      leaderBefore: before,
      leaderAfter: after,
      now: 123,
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'best',
      actor,
      bookId: 'book-b',
      mutationKind: 'book_added',
      before: {
        scenarioId: 'before',
        coveredCount: 3,
        circleBookIds: ['book-a'],
        leftOutUserIds: ['u4'],
      },
      after: {
        scenarioId: 'after',
        coveredCount: 6,
        circleBookIds: ['book-b', 'book-c'],
        leftOutUserIds: [],
      },
      addedCircleBookIds: ['book-b', 'book-c'],
      removedCircleBookIds: ['book-a'],
    })
  })

  it('emits leftout events only for participants newly missing from the leader', () => {
    const before = scenario('before', [circle('book-a', ['u1', 'u2', 'u3'])], [
      { userId: 'old-leftout', pseudonym: 'Already Left' },
    ])
    const after = scenario('after', [circle('book-b', ['u1', 'u2', 'u4'])], [
      { userId: 'old-leftout', pseudonym: 'Already Left' },
      { userId: 'u3', pseudonym: 'Newly Left' },
    ])

    const events = buildFeedEventsForMutation({
      actor,
      bookId: 'book-b',
      kind: 'rank_changed',
      leaderBefore: before,
      leaderAfter: after,
      now: 456,
    })

    expect(events.filter((event) => event.type === 'leftout')).toEqual([
      {
        type: 'leftout',
        actor,
        bookId: 'book-b',
        mutationKind: 'rank_changed',
        affected: { userId: 'u3', pseudonym: 'Newly Left' },
        cause: {
          actor,
          bookId: 'book-b',
          mutationKind: 'rank_changed',
          leaderBeforeId: 'before',
          leaderAfterId: 'after',
          at: 456,
        },
      },
    ])
  })

  it('does not emit events when leader composition and leftout set are unchanged', () => {
    const before = scenario('same', [circle('book-a', ['u1', 'u2', 'u3'])], [
      { userId: 'u4', pseudonym: 'User 4' },
    ])
    const after = scenario('same', [circle('book-a', ['u1', 'u2', 'u3'])], [
      { userId: 'u4', pseudonym: 'User 4' },
    ])

    expect(hasLeaderChanged(before, after)).toBe(false)
    expect(buildFeedEventsForMutation({
      actor,
      bookId: 'book-a',
      kind: 'book_removed',
      leaderBefore: before,
      leaderAfter: after,
    })).toEqual([])
  })

  it('buildFeedEventsForMutation строит best-драфт для participant_left при улучшении расклада', () => {
    // Участник выходит, и расклад улучшается (например, убирается ограничение минимального размера)
    const before = scenario('before', [circle('book-a', ['u1', 'u2'])], [
      { userId: 'u3', pseudonym: 'Белка' },
    ])
    const after = scenario('after', [circle('book-a', ['u1', 'u2']), circle('book-b', ['u4', 'u5', 'u6'])])

    const events = buildFeedEventsForMutation({
      actor: { userId: 'u3', pseudonym: 'Белка' },
      bookId: '',
      kind: 'participant_left',
      leaderBefore: before,
      leaderAfter: after,
      now: 100,
    })

    expect(events.some((e) => e.type === 'best')).toBe(true)
    const bestEvent = events.find((e) => e.type === 'best')
    expect(bestEvent).toMatchObject({
      type: 'best',
      mutationKind: 'participant_left',
      addedCircleBookIds: expect.arrayContaining(['book-b']),
      removedCircleBookIds: [],
    })
  })

  it('exposes pure summary and leftout comparison helpers for the orchestrator', () => {
    const before = scenario('before', [circle('book-a', ['u1', 'u2', 'u3'])])
    const after = scenario('after', [circle('book-a', ['u1', 'u2', 'u3'])], [
      { userId: 'u4', pseudonym: 'User 4' },
    ])

    expect(summarizeLeader(after)).toMatchObject({
      scenarioId: 'after',
      coveredCount: 3,
      totalCount: 4,
      circleBookIds: ['book-a'],
      leftOutUserIds: ['u4'],
    })
    expect(newlyLeftOut(before, after)).toEqual([{ userId: 'u4', pseudonym: 'User 4' }])
  })
})
