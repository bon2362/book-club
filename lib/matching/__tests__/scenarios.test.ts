import { generateScenarios } from '../scenarios'

// Helpers to build test fixtures
function makeParticipants(n: number) {
  return Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, pseudonym: `Участник${i + 1}` }))
}

function makeBook(bookId: string, readingStatus: string | null = null) {
  return { bookId, readingStatus }
}

function allSignedUp(userIds: string[], bookId: string) {
  return userIds.map(userId => ({ userId, bookId }))
}

function rankAll(userIds: string[], bookId: string, rank: number) {
  return userIds.map(userId => ({ userId, bookId, rank }))
}

describe('generateScenarios', () => {
  const participants = makeParticipants(6)
  const userIds = participants.map(p => p.userId)

  it('returns empty array when no books', () => {
    const result = generateScenarios({
      participants,
      books: [],
      signups: [],
      ranks: [],
      targetGroupSize: 3,
    })
    expect(result).toEqual([])
  })

  it('returns empty array when no signups', () => {
    const result = generateScenarios({
      participants,
      books: [makeBook('b1')],
      signups: [],
      ranks: [],
      targetGroupSize: 3,
    })
    expect(result).toEqual([])
  })

  it('excludes books with reading_status=reading', () => {
    const result = generateScenarios({
      participants,
      books: [makeBook('b1', 'reading')],
      signups: allSignedUp(userIds, 'b1'),
      ranks: rankAll(userIds, 'b1', 1),
      targetGroupSize: 3,
    })
    expect(result).toEqual([])
  })

  it('excludes books without enough signups', () => {
    const result = generateScenarios({
      participants: makeParticipants(2),
      books: [makeBook('b1')],
      signups: allSignedUp(['u1', 'u2'], 'b1'),
      ranks: [],
      targetGroupSize: 3,
    })
    expect(result).toEqual([])
  })

  it('groups have exactly targetGroupSize members', () => {
    const result = generateScenarios({
      participants,
      books: [makeBook('b1')],
      signups: allSignedUp(userIds, 'b1'),
      ranks: rankAll(userIds, 'b1', 2),
      targetGroupSize: 3,
    })
    expect(result).toHaveLength(1)
    expect(result[0].members).toHaveLength(3)
  })

  it('no participant repeats across selected groups', () => {
    // 6 participants, 2 books each with 6 signups → should produce 2 groups, 3+3=6 unique
    const result = generateScenarios({
      participants,
      books: [makeBook('b1'), makeBook('b2')],
      signups: [
        ...allSignedUp(userIds, 'b1'),
        ...allSignedUp(userIds, 'b2'),
      ],
      ranks: [
        ...rankAll(userIds, 'b1', 2),
        ...rankAll(userIds, 'b2', 2),
      ],
      targetGroupSize: 3,
    })
    expect(result).toHaveLength(2)
    const allMemberIds = result.flatMap(c => c.members.map(m => m.userId))
    const unique = new Set(allMemberIds)
    expect(unique.size).toBe(allMemberIds.length)
  })

  it('tier leader is assigned to top card only', () => {
    const result = generateScenarios({
      participants,
      books: [makeBook('b1'), makeBook('b2')],
      signups: [
        ...allSignedUp(userIds.slice(0, 3), 'b1'),
        ...allSignedUp(userIds.slice(3, 6), 'b2'),
      ],
      ranks: [
        ...rankAll(userIds.slice(0, 3), 'b1', 1),
        ...rankAll(userIds.slice(3, 6), 'b2', 5),
      ],
      targetGroupSize: 3,
    })
    const leaders = result.filter(c => c.tier === 'leader')
    expect(leaders).toHaveLength(1)
    expect(leaders[0].bookId).toBe('b1')
  })

  it('tier max-coverage assigned to all cards with same wantsCount as leader', () => {
    // 3 books, each with 3 signups and rank=1 → all tied → all max-coverage (except leader)
    const p3 = makeParticipants(9)
    const books = [makeBook('b1'), makeBook('b2'), makeBook('b3')]
    const signups = [
      ...allSignedUp(p3.slice(0, 3).map(p => p.userId), 'b1'),
      ...allSignedUp(p3.slice(3, 6).map(p => p.userId), 'b2'),
      ...allSignedUp(p3.slice(6, 9).map(p => p.userId), 'b3'),
    ]
    const ranks = [
      ...rankAll(p3.slice(0, 3).map(p => p.userId), 'b1', 1),
      ...rankAll(p3.slice(3, 6).map(p => p.userId), 'b2', 1),
      ...rankAll(p3.slice(6, 9).map(p => p.userId), 'b3', 1),
    ]
    const result = generateScenarios({ participants: p3, books, signups, ranks, targetGroupSize: 3 })
    expect(result).toHaveLength(3)
    expect(result.filter(c => c.tier === 'leader')).toHaveLength(1)
    expect(result.filter(c => c.tier === 'max-coverage')).toHaveLength(2)
    expect(result.filter(c => c.tier === 'sub-max')).toHaveLength(0)
  })

  it('tier sub-max assigned when wantsCount is less than leader', () => {
    const p6 = makeParticipants(6)
    const books = [makeBook('b1'), makeBook('b2')]
    const signups = [
      ...allSignedUp(p6.slice(0, 3).map(p => p.userId), 'b1'),
      ...allSignedUp(p6.slice(3, 6).map(p => p.userId), 'b2'),
    ]
    const ranks = [
      ...rankAll(p6.slice(0, 3).map(p => p.userId), 'b1', 1),  // wantsCount=3
      ...rankAll(p6.slice(3, 6).map(p => p.userId), 'b2', 5),  // wantsCount=0
    ]
    const result = generateScenarios({ participants: p6, books, signups, ranks, targetGroupSize: 3 })
    expect(result).toHaveLength(2)
    expect(result.find(c => c.bookId === 'b1')?.tier).toBe('leader')
    expect(result.find(c => c.bookId === 'b2')?.tier).toBe('sub-max')
  })

  it('respects maxResults', () => {
    const p = makeParticipants(30)
    const books = Array.from({ length: 10 }, (_, i) => makeBook(`b${i}`))
    const signups = books.flatMap(b => allSignedUp(p.slice(0, 5).map(x => x.userId), b.bookId))
    const result = generateScenarios({ participants: p, books, signups, ranks: [], targetGroupSize: 3, maxResults: 3 })
    expect(result.length).toBeLessThanOrEqual(3)
  })

  it('handles null ranks (unranked participants)', () => {
    const result = generateScenarios({
      participants,
      books: [makeBook('b1')],
      signups: allSignedUp(userIds, 'b1'),
      ranks: [],
      targetGroupSize: 3,
    })
    expect(result).toHaveLength(1)
    expect(result[0].unrankedCount).toBe(3)
    expect(result[0].wantsCount).toBe(0)
  })

  it('perf: N=30 participants, M=50 books median < 200ms', () => {
    const p = makeParticipants(30)
    const books = Array.from({ length: 50 }, (_, i) => makeBook(`book${i}`))
    const signups = books.flatMap(b =>
      p.slice(0, 10).map(x => ({ userId: x.userId, bookId: b.bookId }))
    )
    const ranks = books.flatMap(b =>
      p.slice(0, 10).map((x, i) => ({ userId: x.userId, bookId: b.bookId, rank: (i % 7) + 1 }))
    )

    const times: number[] = []
    for (let run = 0; run < 11; run++) {
      const start = Date.now()
      generateScenarios({ participants: p, books, signups, ranks, targetGroupSize: 3 })
      times.push(Date.now() - start)
    }
    times.sort((a, b) => a - b)
    const median = times[Math.floor(times.length / 2)]
    const p95 = times[Math.floor(times.length * 0.95)]
    expect(median).toBeLessThan(200)
    expect(p95).toBeLessThan(400)
  })
})
