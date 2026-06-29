import {
  filterRankedSignups,
  generateSatisfactionScenarioSets,
} from '../scenarios'

const participants = ['u1', 'u2', 'u3', 'u4'].map((userId) => ({
  userId,
  displayName: userId,
}))

describe('filterRankedSignups', () => {
  it('keeps only user-book signups with a non-null rank', () => {
    expect(filterRankedSignups(
      [
        { userId: 'u1', bookId: 'b1' },
        { userId: 'u2', bookId: 'b1' },
        { userId: 'u3', bookId: 'b1' },
      ],
      [
        { userId: 'u1', bookId: 'b1', rank: 1 },
        { userId: 'u2', bookId: 'b1', rank: null },
      ],
    )).toEqual([{ userId: 'u1', bookId: 'b1' }])
  })
})

describe('generateSatisfactionScenarioSets', () => {
  it('preserves satisfaction ordering instead of preferring fuller coverage', () => {
    const result = generateSatisfactionScenarioSets({
      participants,
      books: [{ bookId: 'favorite' }, { bookId: 'fallback' }],
      signups: [
        { userId: 'u1', bookId: 'favorite' },
        { userId: 'u2', bookId: 'favorite' },
        { userId: 'u3', bookId: 'favorite' },
        { userId: 'u1', bookId: 'fallback' },
        { userId: 'u2', bookId: 'fallback' },
        { userId: 'u3', bookId: 'fallback' },
        { userId: 'u4', bookId: 'fallback' },
      ],
      ranks: [
        { userId: 'u1', bookId: 'favorite', rank: 1 },
        { userId: 'u2', bookId: 'favorite', rank: 1 },
        { userId: 'u3', bookId: 'favorite', rank: 1 },
        { userId: 'u1', bookId: 'fallback', rank: 5 },
        { userId: 'u2', bookId: 'fallback', rank: 5 },
        { userId: 'u3', bookId: 'fallback', rank: 5 },
        { userId: 'u4', bookId: 'fallback', rank: 5 },
      ],
      minGroupSize: 3,
      maxGroupSize: 4,
    })

    expect(result.scenarios[0].circles[0].bookId).toBe('favorite')
    expect(result.scenarios[0].score.avgRank).toBe(1)
  })

  it('does not cap the ranked scenarios at the old coverage limit', () => {
    const books = Array.from({ length: 12 }, (_, index) => ({ bookId: `b${index + 1}` }))
    const threeParticipants = participants.slice(0, 3)
    const result = generateSatisfactionScenarioSets({
      participants: threeParticipants,
      books,
      signups: books.flatMap(({ bookId }) => (
        threeParticipants.map(({ userId }) => ({ userId, bookId }))
      )),
      ranks: books.flatMap(({ bookId }) => (
        threeParticipants.map(({ userId }) => ({ userId, bookId, rank: 1 }))
      )),
      minGroupSize: 3,
      maxGroupSize: 3,
    })

    expect(result.scenarios).toHaveLength(12)
  })
})
