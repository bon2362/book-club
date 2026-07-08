import { nextRank, compactRanks, manualOrder, planBackfill } from '../rank-assignment'

describe('nextRank', () => {
  it('returns 1 for an empty list', () => {
    expect(nextRank([])).toBe(1)
  })
  it('returns max rank + 1', () => {
    expect(nextRank([{ bookId: 'a', rank: 1 }, { bookId: 'b', rank: 4 }])).toBe(5)
  })
})

describe('compactRanks', () => {
  it('reindexes to 1..N preserving ascending rank order', () => {
    expect(compactRanks([{ bookId: 'b', rank: 5 }, { bookId: 'a', rank: 2 }])).toEqual([
      { bookId: 'a', rank: 1 },
      { bookId: 'b', rank: 2 },
    ])
  })
})

describe('manualOrder', () => {
  it('assigns rank = position and source manual', () => {
    expect(manualOrder(['x', 'y'])).toEqual([
      { bookId: 'x', rank: 1, source: 'manual' },
      { bookId: 'y', rank: 2, source: 'manual' },
    ])
  })
})

describe('planBackfill', () => {
  it('keeps existing ranks as manual and appends unranked as auto', () => {
    const result = planBackfill(
      [{ bookId: 'b', rank: 2 }, { bookId: 'a', rank: 1 }],
      ['c', 'd'],
    )
    expect(result).toEqual([
      { bookId: 'a', rank: 1, source: 'manual' },
      { bookId: 'b', rank: 2, source: 'manual' },
      { bookId: 'c', rank: 3, source: 'auto' },
      { bookId: 'd', rank: 4, source: 'auto' },
    ])
  })
  it('handles a user with no prior ranks', () => {
    expect(planBackfill([], ['c', 'd'])).toEqual([
      { bookId: 'c', rank: 1, source: 'auto' },
      { bookId: 'd', rank: 2, source: 'auto' },
    ])
  })
})
