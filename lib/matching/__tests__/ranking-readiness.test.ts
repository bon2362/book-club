import {
  listNeedsRankingGate,
  userNeedsRankingGate,
} from '../ranking-readiness'

describe('listNeedsRankingGate', () => {
  it('does not block a participant with an empty list', () => {
    expect(listNeedsRankingGate([])).toBe(false)
  })

  it('blocks when at least one active list book has no rank', () => {
    expect(listNeedsRankingGate([
      { isInList: true, personalStatus: null, rank: 1 },
      { isInList: true, personalStatus: null, rank: null },
    ])).toBe(true)
  })

  it('ignores inactive and non-list books without ranks', () => {
    expect(listNeedsRankingGate([
      { isInList: true, personalStatus: 'read', rank: null },
      { isInList: false, personalStatus: null, rank: null },
      { isInList: true, personalStatus: null, rank: 2 },
    ])).toBe(false)
  })
})

describe('userNeedsRankingGate', () => {
  const signups = [
    { userId: 'u1', bookId: 'b1' },
    { userId: 'u1', bookId: 'b2' },
    { userId: 'u2', bookId: 'b1' },
  ]

  it('does not block a user without active signups', () => {
    expect(userNeedsRankingGate('u3', signups, [])).toBe(false)
  })

  it('blocks when any active signup has no non-null rank', () => {
    expect(userNeedsRankingGate('u1', signups, [
      { userId: 'u1', bookId: 'b1', rank: 1 },
      { userId: 'u1', bookId: 'b2', rank: null },
    ])).toBe(true)
  })

  it('does not block after every active signup is ranked', () => {
    expect(userNeedsRankingGate('u1', signups, [
      { userId: 'u1', bookId: 'b1', rank: 1 },
      { userId: 'u1', bookId: 'b2', rank: 4 },
    ])).toBe(false)
  })
})
