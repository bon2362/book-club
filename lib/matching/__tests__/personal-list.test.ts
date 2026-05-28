import { fetchPersonalList } from '../personal-list'
import { db } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  db: { select: jest.fn() },
}))
jest.mock('@/lib/db/schema', () => ({
  signupBooks: {},
  bookPriorities: {},
  books: {},
}))

const mockDb = db as jest.Mocked<typeof db>

function makeChain(result: unknown[]) {
  return {
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockResolvedValue(result),
  }
}

describe('fetchPersonalList', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns empty array when user has no signups', async () => {
    mockDb.select = jest.fn().mockReturnValue(makeChain([]))
    const result = await fetchPersonalList('u1')
    expect(result).toEqual([])
  })

  it('returns books sorted by rank then title', async () => {
    const rows = [
      { bookId: 'b1', title: 'Книга А', author: 'Автор', coverUrl: null, readingStatus: null, rank: 1 },
      { bookId: 'b2', title: 'Книга Б', author: 'Автор', coverUrl: null, readingStatus: null, rank: 2 },
      { bookId: 'b3', title: 'Книга В', author: 'Автор', coverUrl: null, readingStatus: 'reading', rank: null },
    ]
    mockDb.select = jest.fn().mockReturnValue(makeChain(rows))
    const result = await fetchPersonalList('u1')
    expect(result).toHaveLength(3)
    expect(result[0].bookId).toBe('b1')
    expect(result[2].readingStatus).toBe('reading')
  })

  it('includes reading books in the list', async () => {
    const rows = [
      { bookId: 'b1', title: 'Читаемая', author: 'Автор', coverUrl: null, readingStatus: 'reading', rank: null },
    ]
    mockDb.select = jest.fn().mockReturnValue(makeChain(rows))
    const result = await fetchPersonalList('u1')
    expect(result[0].readingStatus).toBe('reading')
  })
})
