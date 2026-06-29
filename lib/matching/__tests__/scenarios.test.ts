import {
  compareCircleSatisfaction,
  filterRankedSignups,
  generateScenarioSets,
  generateSatisfactionScenarioSets,
  type GenerateScenariosInput,
  type MatchingCircle,
} from '../scenarios'

function input(overrides: Partial<GenerateScenariosInput> = {}): GenerateScenariosInput {
  const participants = ['u1', 'u2', 'u3', 'u4'].map((userId) => ({
    userId,
    displayName: userId,
  }))
  return {
    participants,
    books: [{ bookId: 'b1' }],
    signups: participants.map(({ userId }) => ({ userId, bookId: 'b1' })),
    ranks: participants.map(({ userId }, index) => ({ userId, bookId: 'b1', rank: index + 1 })),
    minGroupSize: 3,
    maxGroupSize: 4,
    ...overrides,
  }
}

function circle(id: string, ranks: number[]): MatchingCircle {
  const members = ranks.map((rank, index) => ({
    userId: `u${index + 1}`,
    displayName: `Участник ${index + 1}`,
    rank,
    interest: rank <= 3 ? 'очень хочу' as const : 'хочу' as const,
  }))
  return {
    id,
    bookId: id,
    members,
    minSize: 3,
    maxSize: 4,
    wantsCount: members.filter((member) => member.rank <= 3).length,
    avgRank: ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length,
    worstRank: Math.max(...ranks),
    unrankedCount: 0,
  }
}

describe('single satisfaction scenario engine', () => {
  it('excludes signups that do not yet have a rank', () => {
    expect(filterRankedSignups(
      [{ userId: 'u1', bookId: 'b1' }, { userId: 'u2', bookId: 'b1' }],
      [{ userId: 'u1', bookId: 'b1', rank: 1 }, { userId: 'u2', bookId: 'b1', rank: null }],
    )).toEqual([{ userId: 'u1', bookId: 'b1' }])
  })

  it('returns no scenarios until enough ranked readers remain', () => {
    const result = generateSatisfactionScenarioSets(input({
      ranks: [{ userId: 'u1', bookId: 'b1', rank: 1 }],
    }))
    expect(result.scenarios).toEqual([])
  })

  it('ranks lower average preference ahead of a larger but less satisfying circle', () => {
    const favorite = circle('favorite', [1, 1, 1])
    const fallback = circle('fallback', [5, 5, 5, 5])
    expect(compareCircleSatisfaction(favorite, fallback)).toBeGreaterThan(0)
  })

  it('uses satisfaction ordering without a mode switch', () => {
    const result = generateScenarioSets(input({
      books: [{ bookId: 'favorite' }, { bookId: 'fallback' }],
      signups: [
        ...['u1', 'u2', 'u3'].map((userId) => ({ userId, bookId: 'favorite' })),
        ...['u1', 'u2', 'u3', 'u4'].map((userId) => ({ userId, bookId: 'fallback' })),
      ],
      ranks: [
        ...['u1', 'u2', 'u3'].map((userId) => ({ userId, bookId: 'favorite', rank: 1 })),
        ...['u1', 'u2', 'u3', 'u4'].map((userId) => ({ userId, bookId: 'fallback', rank: 5 })),
      ],
    }))

    expect(result.scenarios[0].circles[0].bookId).toBe('favorite')
  })

  it('does not cap the ranked scenario list at the removed legacy limit', () => {
    const books = Array.from({ length: 12 }, (_, index) => ({ bookId: `b${index + 1}` }))
    const participants = input().participants.slice(0, 3)
    const result = generateSatisfactionScenarioSets(input({
      participants,
      books,
      signups: books.flatMap(({ bookId }) => participants.map(({ userId }) => ({ userId, bookId }))),
      ranks: books.flatMap(({ bookId }) => participants.map(({ userId }) => ({ userId, bookId, rank: 1 }))),
      maxGroupSize: 3,
    }))

    expect(result.scenarios).toHaveLength(12)
  })

  it('keeps display names in generated members', () => {
    const result = generateSatisfactionScenarioSets(input())
    expect(result.scenarios[0].circles[0].members[0]).toHaveProperty('displayName')
    expect(result.scenarios[0].circles[0].members[0]).not.toHaveProperty('pseudonym')
  })
})
