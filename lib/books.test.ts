/**
 * @jest-environment node
 */

// Queue of mocked SQL results, consumed in order by terminal query methods.
const queue: unknown[][] = []
function pushResult(rows: unknown[]) { queue.push(rows) }
function pullResult(): Promise<unknown[]> {
  return Promise.resolve(queue.length > 0 ? queue.shift()! : [])
}

jest.mock('@/lib/db', () => {
  // Build a thenable chain: from()/where()/groupBy()/orderBy()/limit() all return
  // the same object, which is awaitable. When awaited, it resolves to the next
  // queued result.
  function buildChain() {
    const chain = {
      from: jest.fn(() => chain),
      where: jest.fn(() => chain),
      groupBy: jest.fn(() => chain),
      orderBy: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      then: <T,>(onFulfilled: (value: unknown) => T) => pullResult().then(onFulfilled),
    } as unknown as Record<string, jest.Mock>
    return chain
  }
  return {
    db: {
      select: jest.fn(() => buildChain()),
      insert: jest.fn(() => ({
        values: jest.fn().mockReturnValue({
          onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
        }),
      })),
    },
    sql: jest.fn(),
  }
})

import { fetchBooksWithCovers, fetchBooksForAdmin, fetchBookById } from './books'

function bookRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    canonicalKey: null,
    title: 'Title',
    author: 'Author',
    tags: ['tag'],
    type: 'book',
    size: '',
    pages: 100,
    publishedDate: '2024',
    textUrl: '',
    description: '',
    coverUrl: null,
    whyRead: null,
    recommendationLink: null,
    readingStatus: null,
    visibility: 'published',
    isNew: false,
    sortOrder: 0,
    source: 'sheets_import',
    sourceSubmissionId: null,
    legacySheetsRowId: '1',
    createdAt: new Date(),
    updatedAt: new Date(),
    publishedAt: new Date(),
    hiddenAt: null,
    archivedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  queue.length = 0
  delete process.env.NEXTAUTH_TEST_MODE
})

describe('lib/books — fetchBooksWithCovers', () => {
  it('returns published rows with signup counts joined by book_id', async () => {
    pushResult([
      bookRow({ id: 'b1', title: 'Book One' }),
      bookRow({ id: 'b2', title: 'Book Two' }),
    ])
    pushResult([{ bookId: 'b1', count: 3 }])
    pushResult([{ bookName: 'Book Two', count: 5 }])

    const result = await fetchBooksWithCovers()
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 'b1', name: 'Book One', signupCount: 3 })
    expect(result[1]).toMatchObject({ id: 'b2', name: 'Book Two', signupCount: 5 })
  })

  it('sums book_id count and legacy book_name count for the same title', async () => {
    pushResult([bookRow({ id: 'b1', title: 'Shared' })])
    pushResult([{ bookId: 'b1', count: 2 }])
    pushResult([{ bookName: 'Shared', count: 4 }])
    const [book] = await fetchBooksWithCovers()
    expect(book.signupCount).toBe(6)
  })

  it('returns an empty list when no books are published', async () => {
    pushResult([])
    pushResult([])
    pushResult([])
    expect(await fetchBooksWithCovers()).toEqual([])
  })

  it('maps DB row to BookWithCover shape (article type capitalised, source preserved)', async () => {
    pushResult([bookRow({
      id: 'sub-1',
      title: 'Article Title',
      type: 'article',
      source: 'submission',
      sourceSubmissionId: 'sub-1',
      readingStatus: 'reading',
      isNew: true,
    })])
    pushResult([])
    pushResult([])
    const [book] = await fetchBooksWithCovers()
    expect(book.type).toBe('Article')
    expect(book.submittedByMember).toBe(true)
    expect(book.source).toBe('submission')
    expect(book.status).toBe('reading')
    expect(book.isNew).toBe(true)
  })
})

describe('lib/books — fetchBooksForAdmin', () => {
  it('includes hidden books', async () => {
    pushResult([
      bookRow({ id: 'h1', visibility: 'hidden', title: 'Hidden Book' }),
      bookRow({ id: 'p1', visibility: 'published', title: 'Public Book' }),
    ])
    pushResult([])
    pushResult([])
    const result = await fetchBooksForAdmin()
    expect(result.map(b => b.id)).toEqual(['h1', 'p1'])
    expect(result[0].visibility).toBe('hidden')
  })
})

describe('lib/books — fetchBookById', () => {
  it('returns null when no row matches', async () => {
    pushResult([])
    expect(await fetchBookById('missing')).toBeNull()
  })

  it('returns the mapped row when it exists', async () => {
    pushResult([bookRow({ id: 'x', title: 'Hello' })])
    const got = await fetchBookById('x')
    expect(got).toMatchObject({ id: 'x', name: 'Hello' })
  })
})
