import {
  compareCircleSatisfaction,
  compareScenarioSatisfaction,
  filterSignupsByMode,
  generateScenarioSets,
  generateScenarios,
  type MatchingCircle,
  type MatchingScenario,
} from '../scenarios'

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

function circle(id: string, ranks: number[]): MatchingCircle {
  const members = ranks.map((rankValue, i) => ({
    userId: `${id}-u${i}`,
    pseudonym: `${id}-p${i}`,
    rank: rankValue,
    interest: (rankValue <= 3 ? 'очень хочу' : 'хочу') as 'очень хочу' | 'хочу',
  }))
  const ranked = members.filter((m) => m.rank !== null)
  return {
    id,
    bookId: id.split(':')[0],
    members,
    minSize: 3,
    maxSize: 4,
    wantsCount: ranked.filter((m) => m.rank! <= 3).length,
    avgRank: ranked.reduce((sum, m) => sum + m.rank!, 0) / ranked.length,
    worstRank: Math.max(...ranked.map((m) => m.rank!)),
    unrankedCount: members.length - ranked.length,
  }
}

function scenario(id: string, circles: MatchingCircle[]): Pick<MatchingScenario, 'id' | 'circles' | 'score'> {
  const members = circles.flatMap((c) => c.members)
  const ranked = members.filter((m) => m.rank !== null)
  const rankSum = ranked.reduce((sum, m) => sum + m.rank!, 0)
  return {
    id,
    circles,
    score: {
      coveredCount: new Set(members.map((m) => m.userId)).size,
      totalCount: 9,
      coverageRatio: 0,
      strongInterestCount: ranked.filter((m) => m.rank! <= 3).length,
      rankedCount: ranked.length,
      unrankedCount: members.length - ranked.length,
      rankSum,
      avgRank: rankSum / ranked.length,
      worstRank: Math.max(...ranked.map((m) => m.rank!)),
    },
  }
}

describe('generateScenarioSets', () => {
  it('defaults overview.mode to coverage when no mode is given', () => {
    const participants = makeParticipants(3)
    const result = generateScenarioSets({
      participants,
      books: [makeBook('b1')],
      signups: allSignedUp(['u1', 'u2', 'u3'], 'b1'),
      ranks: rankAll(['u1', 'u2', 'u3'], 'b1', 1),
      minGroupSize: 3, maxGroupSize: 3,
    })

    expect(result.mode).toBe('coverage')
  })

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

  it('satisfaction mode keeps the perfect trio as leader even if a fuller worse layout exists', () => {
    const participants = makeParticipants(4)
    const result = generateScenarioSets({
      mode: 'satisfaction',
      participants,
      books: [makeBook('b1'), makeBook('b2')],
      signups: [
        ...allSignedUp(['u1', 'u2', 'u3'], 'b1'),
        ...allSignedUp(['u2', 'u3', 'u4'], 'b2'),
      ],
      ranks: [
        ...rankAll(['u1', 'u2', 'u3'], 'b1', 1),
        ...rankAll(['u2', 'u3', 'u4'], 'b2', 5),
      ],
      minGroupSize: 3, maxGroupSize: 3,
    })

    expect(result.mode).toBe('satisfaction')
    expect(result.leader?.circles).toHaveLength(1)
    expect(result.leader?.circles[0].bookId).toBe('b1')
    expect(result.leader?.score.avgRank).toBe(1)
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

  it('keeps the default ten-scenario cap for coverage mode', () => {
    const participants = makeParticipants(3)
    const books = Array.from({ length: 12 }, (_, i) => makeBook(`b${i + 1}`))
    const signups = books.flatMap((book) => allSignedUp(participants.map((p) => p.userId), book.bookId))
    const ranks = books.flatMap((book) => rankAll(participants.map((p) => p.userId), book.bookId, 1))

    const result = generateScenarioSets({ participants, books, signups, ranks, minGroupSize: 3, maxGroupSize: 3 })

    expect(result.scenarios).toHaveLength(10)
    expect(result.mode).toBe('coverage')
  })

  it('does not apply the default ten-scenario cap to satisfaction mode', () => {
    const participants = makeParticipants(3)
    const books = Array.from({ length: 12 }, (_, i) => makeBook(`b${i + 1}`))
    const signups = books.flatMap((book) => allSignedUp(participants.map((p) => p.userId), book.bookId))
    const ranks = books.flatMap((book) => rankAll(participants.map((p) => p.userId), book.bookId, 1))

    const result = generateScenarioSets({ participants, books, signups, ranks, minGroupSize: 3, maxGroupSize: 3, mode: 'satisfaction' })

    expect(result.scenarios).toHaveLength(12)
    expect(result.mode).toBe('satisfaction')
  })

  it('hides satisfaction scenarios that are only a subset of another scenario (by circles)', () => {
    const participants = makeParticipants(6)
    const result = generateScenarioSets({
      participants,
      books: [makeBook('perfect'), makeBook('extra')],
      signups: [
        ...allSignedUp(['u1', 'u2', 'u3'], 'perfect'),
        ...allSignedUp(['u4', 'u5', 'u6'], 'extra'),
      ],
      ranks: [
        ...rankAll(['u1', 'u2', 'u3'], 'perfect', 1),
        ...rankAll(['u4', 'u5', 'u6'], 'extra', 2),
      ],
      minGroupSize: 3,
      maxGroupSize: 3,
      mode: 'satisfaction',
    })

    expect(result.scenarios.map((scenario) => scenario.circles.map((circle) => circle.bookId).sort())).toEqual([
      ['extra', 'perfect'],
    ])
  })

  it('filters satisfaction scenarios where same book has subset of members', () => {
    // Single book with 4 participants ranked, minGroupSize 3, maxGroupSize 5
    // Should generate circles of size 3 and 4 (all combinations of 3-4 from 4 members)
    // The scenario with {u1, u2, u3} on book1 should be filtered out as dominated by {u1, u2, u3, u4}
    const participants = makeParticipants(4)
    const result = generateScenarioSets({
      participants,
      books: [makeBook('book1')],
      signups: allSignedUp(['u1', 'u2', 'u3', 'u4'], 'book1'),
      ranks: [
        rank('u1', 'book1', 1),
        rank('u2', 'book1', 2),
        rank('u3', 'book1', 4),
        rank('u4', 'book1', 5),
      ],
      minGroupSize: 3,
      maxGroupSize: 5,
      mode: 'satisfaction',
    })

    // The only scenario should be the one with maximum members for this book (all 4 ranked)
    expect(result.scenarios).toHaveLength(1)
    expect(result.scenarios[0].circles).toHaveLength(1)
    expect(result.scenarios[0].circles[0].bookId).toBe('book1')
    // The leader should have all 4 ranked members (u1–u4)
    expect(result.scenarios[0].circles[0].members).toHaveLength(4)
    const memberIds = new Set(result.scenarios[0].circles[0].members.map((m) => m.userId))
    expect(memberIds).toEqual(new Set(['u1', 'u2', 'u3', 'u4']))
  })

  it('preserves satisfaction scenarios with non-overlapping alternatives (same book, disjoint member subsets)', () => {
    // When we have 6 participants for same book, minGroupSize 3, maxGroupSize 3
    // We can form groups {u1, u2, u3} and {u4, u5, u6}
    // These two groups have no shared members, so neither dominates the other
    // Both should be preserved as alternative scenarios
    const participants = makeParticipants(6)
    const result = generateScenarioSets({
      participants,
      books: [makeBook('book1')],
      signups: allSignedUp(['u1', 'u2', 'u3', 'u4', 'u5', 'u6'], 'book1'),
      ranks: [
        ...rankAll(['u1', 'u2', 'u3'], 'book1', 1),
        ...rankAll(['u4', 'u5', 'u6'], 'book1', 1),
      ],
      minGroupSize: 3,
      maxGroupSize: 3,
      mode: 'satisfaction',
    })

    // Both disjoint groups should survive the dominance filter
    expect(result.scenarios.length).toBeGreaterThanOrEqual(2)
    // Each scenario should have one circle
    for (const scenario of result.scenarios) {
      expect(scenario.circles).toHaveLength(1)
      expect(scenario.circles[0].bookId).toBe('book1')
      expect(scenario.circles[0].members).toHaveLength(3)
    }
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

describe('compareCircleSatisfaction', () => {
  it('prefers lower average rank before top-three count', () => {
    expect(compareCircleSatisfaction(circle('a:1', [1, 1, 6]), circle('b:1', [3, 3, 3]))).toBeGreaterThan(0)
  })

  it('breaks average ties by worst rank', () => {
    expect(compareCircleSatisfaction(circle('a:1', [2, 2, 2]), circle('b:1', [1, 1, 4]))).toBeGreaterThan(0)
  })

  it('prefers larger circle when average and worst rank tie', () => {
    expect(compareCircleSatisfaction(circle('a:1', [2, 2, 2, 2]), circle('b:1', [2, 2, 2]))).toBeGreaterThan(0)
  })
})

describe('compareScenarioSatisfaction', () => {
  it('lets a smaller perfect scenario beat a larger good scenario', () => {
    const a = scenario('a', [circle('x:1', [1, 1, 1])])
    const b = scenario('b', [circle('y:1', [2, 2, 2]), circle('z:1', [2, 2, 2])])

    expect(compareScenarioSatisfaction(a, b)).toBeGreaterThan(0)
  })

  it('prefers an extra group when quality prefixes tie', () => {
    const a = scenario('a', [circle('x:1', [1, 1, 1])])
    const b = scenario('b', [circle('x:1', [1, 1, 1]), circle('y:1', [2, 2, 2])])

    expect(compareScenarioSatisfaction(a, b)).toBeLessThan(0)
  })
})

describe('filterSignupsByMode', () => {
  const signups = [
    { userId: 'u1', bookId: 'b1' },
    { userId: 'u1', bookId: 'b2' },
    { userId: 'u2', bookId: 'b1' },
  ]
  const ranks = [
    { userId: 'u1', bookId: 'b1', rank: 1 },
    { userId: 'u1', bookId: 'b2', rank: null },
    { userId: 'u2', bookId: 'b1', rank: 2 },
  ]

  it('keeps all signups in coverage mode', () => {
    expect(filterSignupsByMode(signups, ranks, 'coverage')).toHaveLength(3)
  })

  it('drops signups without a rank in satisfaction mode', () => {
    expect(filterSignupsByMode(signups, ranks, 'satisfaction')).toEqual([
      { userId: 'u1', bookId: 'b1' },
      { userId: 'u2', bookId: 'b1' },
    ])
  })
})
