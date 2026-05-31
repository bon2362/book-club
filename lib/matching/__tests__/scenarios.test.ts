import { generateScenarioSets, generateScenarios } from '../scenarios'

function makeParticipants(n: number) {
  return Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, pseudonym: `Участник${i + 1}` }))
}

function makeBook(bookId: string) {
  return { bookId }
}

function allSignedUp(userIds: string[], bookId: string) {
  return userIds.map((userId) => ({ userId, bookId }))
}

function rankAll(userIds: string[], bookId: string, rank: number) {
  return userIds.map((userId) => ({ userId, bookId, rank }))
}

function rank(userId: string, bookId: string, value: number) {
  return { userId, bookId, rank: value }
}

describe('generateScenarioSets', () => {
  it('returns an empty overview when no scenario can be formed', () => {
    const participants = makeParticipants(3)
    const result = generateScenarioSets({
      participants,
      books: [],
      signups: [],
      ranks: [],
      minGroupSize: 3, maxGroupSize: 3,
    })

    expect(result.leader).toBeNull()
    expect(result.scenarios).toEqual([])
    expect(result.totalCount).toBe(3)
  })

  it('returns one exact-size circle and reports left out participants', () => {
    const participants = makeParticipants(4)
    const result = generateScenarioSets({
      participants,
      books: [makeBook('b1')],
      signups: allSignedUp(['u1', 'u2', 'u3'], 'b1'),
      ranks: rankAll(['u1', 'u2', 'u3'], 'b1', 1),
      minGroupSize: 3, maxGroupSize: 3,
    })

    expect(result.leader?.circles).toHaveLength(1)
    expect(result.leader?.circles[0].bookId).toBe('b1')
    expect(result.leader?.circles[0].members).toHaveLength(3)
    expect(result.leader?.leftOut.map((p) => p.userId)).toEqual(['u4'])
  })

  it('allows a circle to grow up to maxGroupSize when that improves coverage', () => {
    const participants = makeParticipants(4)
    const result = generateScenarioSets({
      participants,
      books: [makeBook('b1')],
      signups: allSignedUp(['u1', 'u2', 'u3', 'u4'], 'b1'),
      ranks: rankAll(['u1', 'u2', 'u3', 'u4'], 'b1', 2),
      minGroupSize: 3, maxGroupSize: 4,
    })

    expect(result.minGroupSize).toBe(3)
    expect(result.maxGroupSize).toBe(4)
    expect(result.leader?.score.coveredCount).toBe(4)
    expect(result.leader?.circles).toHaveLength(1)
    expect(result.leader?.circles[0].members).toHaveLength(4)
    expect(result.leader?.leftOut).toEqual([])
  })

  it('can cover seven participants as 3+4 instead of leaving one out', () => {
    const participants = makeParticipants(7)
    const result = generateScenarioSets({
      participants,
      books: [makeBook('b1'), makeBook('b2')],
      signups: [
        ...allSignedUp(['u1', 'u2', 'u3'], 'b1'),
        ...allSignedUp(['u4', 'u5', 'u6', 'u7'], 'b2'),
      ],
      ranks: [
        ...rankAll(['u1', 'u2', 'u3'], 'b1', 2),
        ...rankAll(['u4', 'u5', 'u6', 'u7'], 'b2', 2),
      ],
      minGroupSize: 3, maxGroupSize: 4,
    })

    expect(result.leader?.score.coveredCount).toBe(7)
    expect(result.leader?.circles.map((circle) => circle.members.length).sort()).toEqual([3, 4])
    expect(result.leader?.leftOut).toEqual([])
  })

  it('combines two disjoint books into one full-coverage scenario', () => {
    const participants = makeParticipants(6)
    const result = generateScenarioSets({
      participants,
      books: [makeBook('b1'), makeBook('b2')],
      signups: [
        ...allSignedUp(['u1', 'u2', 'u3'], 'b1'),
        ...allSignedUp(['u4', 'u5', 'u6'], 'b2'),
      ],
      ranks: [
        ...rankAll(['u1', 'u2', 'u3'], 'b1', 2),
        ...rankAll(['u4', 'u5', 'u6'], 'b2', 2),
      ],
      minGroupSize: 3, maxGroupSize: 3,
    })

    expect(result.leader?.score.coveredCount).toBe(6)
    expect(result.leader?.circles.map((circle) => circle.bookId).sort()).toEqual(['b1', 'b2'])
    expect(result.leader?.tier).toBe('leader')
  })

  it('prioritizes full coverage over a better ranked partial scenario', () => {
    const participants = makeParticipants(6)
    const result = generateScenarioSets({
      participants,
      books: [makeBook('favorite'), makeBook('fallback-a'), makeBook('fallback-b')],
      signups: [
        ...allSignedUp(['u1', 'u2', 'u3'], 'favorite'),
        ...allSignedUp(['u1', 'u2', 'u4'], 'fallback-a'),
        ...allSignedUp(['u3', 'u5', 'u6'], 'fallback-b'),
      ],
      ranks: [
        ...rankAll(['u1', 'u2', 'u3'], 'favorite', 1),
        ...rankAll(['u1', 'u2', 'u4'], 'fallback-a', 4),
        ...rankAll(['u3', 'u5', 'u6'], 'fallback-b', 4),
      ],
      minGroupSize: 3, maxGroupSize: 3,
    })

    expect(result.leader?.score.coveredCount).toBe(6)
    expect(result.leader?.circles.map((circle) => circle.bookId).sort()).toEqual(['fallback-a', 'fallback-b'])
  })

  it('uses stronger top-3 interest as the first tie-breaker for equal coverage', () => {
    const participants = makeParticipants(3)
    const result = generateScenarioSets({
      participants,
      books: [makeBook('strong'), makeBook('weak')],
      signups: [
        ...allSignedUp(['u1', 'u2', 'u3'], 'strong'),
        ...allSignedUp(['u1', 'u2', 'u3'], 'weak'),
      ],
      ranks: [
        rank('u1', 'strong', 1),
        rank('u2', 'strong', 2),
        rank('u3', 'strong', 6),
        ...rankAll(['u1', 'u2', 'u3'], 'weak', 4),
      ],
      minGroupSize: 3, maxGroupSize: 3,
    })

    expect(result.leader?.circles[0].bookId).toBe('strong')
  })

  it('uses lower average rank after coverage and top-3 ties', () => {
    const participants = makeParticipants(3)
    const result = generateScenarioSets({
      participants,
      books: [makeBook('lower-avg'), makeBook('higher-avg')],
      signups: [
        ...allSignedUp(['u1', 'u2', 'u3'], 'lower-avg'),
        ...allSignedUp(['u1', 'u2', 'u3'], 'higher-avg'),
      ],
      ranks: [
        rank('u1', 'lower-avg', 1),
        rank('u2', 'lower-avg', 4),
        rank('u3', 'lower-avg', 4),
        rank('u1', 'higher-avg', 1),
        rank('u2', 'higher-avg', 5),
        rank('u3', 'higher-avg', 5),
      ],
      minGroupSize: 3, maxGroupSize: 3,
    })

    expect(result.leader?.circles[0].bookId).toBe('lower-avg')
  })

  it('uses lower worst rank after average-rank ties', () => {
    const participants = makeParticipants(3)
    const result = generateScenarioSets({
      participants,
      books: [makeBook('lower-worst'), makeBook('higher-worst')],
      signups: [
        ...allSignedUp(['u1', 'u2', 'u3'], 'lower-worst'),
        ...allSignedUp(['u1', 'u2', 'u3'], 'higher-worst'),
      ],
      ranks: [
        rank('u1', 'lower-worst', 1),
        rank('u2', 'lower-worst', 5),
        rank('u3', 'lower-worst', 6),
        rank('u1', 'higher-worst', 1),
        rank('u2', 'higher-worst', 4),
        rank('u3', 'higher-worst', 7),
      ],
      minGroupSize: 3, maxGroupSize: 3,
    })

    expect(result.leader?.circles[0].bookId).toBe('lower-worst')
  })

  it('does not get trapped by the locally best overlapping circle', () => {
    const participants = makeParticipants(6)
    const result = generateScenarioSets({
      participants,
      books: [makeBook('local-best'), makeBook('coverage-a'), makeBook('coverage-b')],
      signups: [
        ...allSignedUp(['u1', 'u2', 'u3'], 'local-best'),
        ...allSignedUp(['u1', 'u2', 'u4'], 'coverage-a'),
        ...allSignedUp(['u3', 'u5', 'u6'], 'coverage-b'),
      ],
      ranks: [
        ...rankAll(['u1', 'u2', 'u3'], 'local-best', 1),
        ...rankAll(['u1', 'u2', 'u4'], 'coverage-a', 5),
        ...rankAll(['u3', 'u5', 'u6'], 'coverage-b', 5),
      ],
      minGroupSize: 3, maxGroupSize: 3,
    })

    expect(result.leader?.score.coveredCount).toBe(6)
    expect(result.leader?.circles.map((circle) => circle.bookId).sort()).toEqual(['coverage-a', 'coverage-b'])
  })

  it('keeps lower-scored diverse circles when they unlock more coverage', () => {
    const participants = makeParticipants(20)
    const result = generateScenarioSets({
      participants,
      books: [makeBook('popular'), makeBook('small')],
      signups: [
        ...allSignedUp(participants.map((p) => p.userId), 'popular'),
        ...allSignedUp(['u1', 'u2', 'u3'], 'small'),
      ],
      ranks: [
        ...rankAll(['u1', 'u2', 'u3'], 'popular', 1),
        ...rankAll(['u4', 'u5', 'u6'], 'popular', 8),
        ...rankAll(['u1', 'u2', 'u3'], 'small', 1),
      ],
      minGroupSize: 3, maxGroupSize: 3,
    })

    expect(result.leader?.score.coveredCount).toBe(6)
    expect(result.leader?.circles.map((circle) => circle.bookId).sort()).toEqual(['popular', 'small'])
  })

  it('never repeats a participant inside one scenario', () => {
    const participants = makeParticipants(6)
    const result = generateScenarioSets({
      participants,
      books: [makeBook('b1'), makeBook('b2'), makeBook('b3')],
      signups: [
        ...allSignedUp(['u1', 'u2', 'u3', 'u4'], 'b1'),
        ...allSignedUp(['u3', 'u4', 'u5', 'u6'], 'b2'),
        ...allSignedUp(['u1', 'u2', 'u5', 'u6'], 'b3'),
      ],
      ranks: [],
      minGroupSize: 3, maxGroupSize: 3,
    })

    for (const scenario of result.scenarios) {
      const userIds = scenario.circles.flatMap((circle) => circle.members.map((m) => m.userId))
      expect(new Set(userIds).size).toBe(userIds.length)
    }
  })

  it('never repeats a book inside one scenario', () => {
    const participants = makeParticipants(6)
    const result = generateScenarioSets({
      participants,
      books: [makeBook('b1'), makeBook('b2')],
      signups: [
        ...allSignedUp(['u1', 'u2', 'u3', 'u4', 'u5', 'u6'], 'b1'),
        ...allSignedUp(['u1', 'u2', 'u3'], 'b2'),
      ],
      ranks: [],
      minGroupSize: 3, maxGroupSize: 3,
    })

    for (const scenario of result.scenarios) {
      const bookIds = scenario.circles.map((circle) => circle.bookId)
      expect(new Set(bookIds).size).toBe(bookIds.length)
    }
  })

  it('respects maxResults for scenario sets', () => {
    const participants = makeParticipants(12)
    const books = Array.from({ length: 8 }, (_, i) => makeBook(`b${i}`))
    const signups = books.flatMap((book) => allSignedUp(participants.map((p) => p.userId), book.bookId))
    const result = generateScenarioSets({ participants, books, signups, ranks: [], minGroupSize: 3, maxGroupSize: 3, maxResults: 3 })

    expect(result.scenarios.length).toBeLessThanOrEqual(3)
  })

  it('perf: N=30 participants, M=50 books stays bounded under coverage', () => {
    const participants = makeParticipants(30)
    const books = Array.from({ length: 50 }, (_, i) => makeBook(`book${i}`))
    const signups = books.flatMap((book) =>
      participants.slice(0, 10).map((participant) => ({ userId: participant.userId, bookId: book.bookId })),
    )
    const ranks = books.flatMap((book) =>
      participants.slice(0, 10).map((participant, i) => ({
        userId: participant.userId,
        bookId: book.bookId,
        rank: (i % 7) + 1,
      })),
    )

    const times: number[] = []
    for (let run = 0; run < 11; run++) {
      const start = Date.now()
      generateScenarioSets({ participants, books, signups, ranks, minGroupSize: 3, maxGroupSize: 3 })
      times.push(Date.now() - start)
    }
    times.sort((a, b) => a - b)
    const median = times[Math.floor(times.length / 2)]
    const p95 = times[Math.floor(times.length * 0.95)]
    expect(median).toBeLessThan(5_000)
    expect(p95).toBeLessThan(10_000)
  })
})

describe('generateScenarios compatibility wrapper', () => {
  it('still returns old ScenarioCard objects for freeze route consumers', () => {
    const participants = makeParticipants(6)
    const result = generateScenarios({
      participants,
      books: [makeBook('b1'), makeBook('b2')],
      signups: [
        ...allSignedUp(['u1', 'u2', 'u3'], 'b1'),
        ...allSignedUp(['u4', 'u5', 'u6'], 'b2'),
      ],
      ranks: [
        ...rankAll(['u1', 'u2', 'u3'], 'b1', 1),
        ...rankAll(['u4', 'u5', 'u6'], 'b2', 5),
      ],
      minGroupSize: 3, maxGroupSize: 3,
    })

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      bookId: 'b1',
      tier: 'leader',
      wantsCount: 3,
      avgRank: 1,
      worstRank: 1,
      unrankedCount: 0,
    })
    expect(result[0].members).toHaveLength(3)
  })

  it('still respects maxResults as the maximum number of legacy cards', () => {
    const participants = makeParticipants(36)
    const books = Array.from({ length: 12 }, (_, i) => makeBook(`b${i + 1}`))
    const signups = books.flatMap((book, index) => {
      const start = index * 3
      return allSignedUp(participants.slice(start, start + 3).map((p) => p.userId), book.bookId)
    })

    const result = generateScenarios({
      participants,
      books,
      signups,
      ranks: [],
      minGroupSize: 3, maxGroupSize: 3,
      maxResults: 10,
    })

    expect(result).toHaveLength(10)
  })
})
