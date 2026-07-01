import {
  listCanEnterSession,
  listHasActiveBook,
  listNeedsRankingGate,
  userNeedsRankingGate,
} from '../ranking-readiness'

describe('listCanEnterSession', () => {
  it('does not let an empty list enter through the gate', () => {
    expect(listCanEnterSession([])).toBe(false)
  })

  it('does not let in while an active book is unranked', () => {
    expect(listCanEnterSession([
      { isInList: true, personalStatus: null, rank: 1 },
      { isInList: true, personalStatus: null, rank: null },
    ])).toBe(false)
  })

  it('lets in once every active book is ranked', () => {
    expect(listCanEnterSession([
      { isInList: true, personalStatus: null, rank: 1 },
      { isInList: false, personalStatus: null, rank: null },
      { isInList: true, personalStatus: 'read', rank: null },
    ])).toBe(true)
  })
})

describe('listHasActiveBook', () => {
  it('is false for an empty list', () => {
    expect(listHasActiveBook([])).toBe(false)
  })

  it('is false when books are only reading/read', () => {
    expect(listHasActiveBook([
      { isInList: true, personalStatus: 'reading' },
      { isInList: true, personalStatus: 'read' },
      { isInList: false, personalStatus: null },
    ])).toBe(false)
  })

  it('is true with one active (unranked) book', () => {
    expect(listHasActiveBook([
      { isInList: true, personalStatus: null },
    ])).toBe(true)
  })
})

describe('!listCanEnterSession (gate visibility semantics)', () => {
  it('shows the gate when there are zero active books', () => {
    expect(!listCanEnterSession([])).toBe(true)
  })

  it('shows the gate when the single active book has no rank', () => {
    expect(!listCanEnterSession([
      { isInList: true, personalStatus: null, rank: null },
    ])).toBe(true)
  })

  it('hides the gate once the single active book is ranked', () => {
    expect(!listCanEnterSession([
      { isInList: true, personalStatus: null, rank: 1 },
    ])).toBe(false)
  })
})

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
