/**
 * @jest-environment node
 */

// Queue of mocked SQL results, consumed in order by terminal query methods.
const queue: unknown[][] = []
function pushResult(rows: unknown[]) { queue.push(rows) }
function pullResult(): Promise<unknown[]> {
  return Promise.resolve(queue.length > 0 ? queue.shift()! : [])
}

const insertValuesCalls: unknown[] = []
const updateSetCalls: unknown[] = []
const originalNodeEnv = process.env.NODE_ENV

function setNodeEnv(value: string) {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    configurable: true,
  })
}

jest.mock('@/lib/db', () => {
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
        values: jest.fn((v: unknown) => {
          insertValuesCalls.push(v)
          return {
            onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
            then: <T,>(onFulfilled: (value: unknown) => T) => Promise.resolve(undefined).then(onFulfilled),
          }
        }),
      })),
      update: jest.fn(() => ({
        set: jest.fn((v: unknown) => {
          updateSetCalls.push(v)
          return { where: jest.fn().mockResolvedValue(undefined) }
        }),
      })),
    },
    sql: jest.fn(),
  }
})

import {
  fetchBooksWithCovers, fetchBooksForAdmin, fetchBookById,
  createBook, updateBook, BookValidationError,
} from './books'

function bookRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    title: 'Title',
    author: 'Author',
    tags: ['tag'],
    type: 'book',
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
    source: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
    publishedAt: new Date(),
    hiddenAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  queue.length = 0
  insertValuesCalls.length = 0
  updateSetCalls.length = 0
  delete process.env.NEXTAUTH_TEST_MODE
  setNodeEnv(originalNodeEnv)
})

describe('lib/books — fetchBooksWithCovers', () => {
  it('returns published rows with signup counts joined by book_id', async () => {
    pushResult([
      bookRow({ id: 'b1', title: 'Book One' }),
      bookRow({ id: 'b2', title: 'Book Two' }),
    ])
    pushResult([
      { bookId: 'b1', count: 3 },
      { bookId: 'b2', count: 5 },
    ])

    const result = await fetchBooksWithCovers()
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 'b1', name: 'Book One', signupCount: 3 })
    expect(result[1]).toMatchObject({ id: 'b2', name: 'Book Two', signupCount: 5 })
  })

  it('reports signupCount=0 when no signups exist for a book', async () => {
    pushResult([bookRow({ id: 'b1', title: 'Lonely' })])
    pushResult([])
    const [book] = await fetchBooksWithCovers()
    expect(book.signupCount).toBe(0)
  })

  it('returns an empty list when no books are published', async () => {
    pushResult([])
    pushResult([])
    expect(await fetchBooksWithCovers()).toEqual([])
  })

  it('filters accidental E2E fixture books in production', async () => {
    setNodeEnv('production')
    pushResult([
      bookRow({ id: '__test_book_1__', title: 'Тестовая книга 1' }),
      bookRow({ id: 'e2e-book', title: 'E2E Auto Signup 123' }),
      bookRow({ id: 'real-book', title: 'Real Book' }),
    ])
    pushResult([])

    const result = await fetchBooksWithCovers()
    expect(result.map(book => book.id)).toEqual(['real-book'])
  })

  it('maps DB row to BookWithCover shape (article type capitalised, source preserved)', async () => {
    pushResult([bookRow({
      id: 'sub-1',
      title: 'Article Title',
      type: 'article',
      source: 'submission',
      readingStatus: 'reading',
      isNew: true,
    })])
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

describe('lib/books — createBook', () => {
  it('throws BookValidationError when title is empty', async () => {
    await expect(createBook({ title: '   ' })).rejects.toBeInstanceOf(BookValidationError)
  })

  it('defaults source=admin, visibility=hidden and stamps hiddenAt', async () => {
    pushResult([bookRow({ id: 'new1', title: 'New' })]) // fetchBookById after insert
    const result = await createBook({ title: 'New Book', author: 'A' })
    expect(result.id).toBe('new1')
    expect(insertValuesCalls).toHaveLength(1)
    const inserted = insertValuesCalls[0] as Record<string, unknown>
    expect(inserted.source).toBe('admin')
    expect(inserted.visibility).toBe('hidden')
    expect(inserted.hiddenAt).toBeInstanceOf(Date)
    expect(inserted.publishedAt).toBeNull()
    expect(inserted.isNew).toBe(false)
  })

  it('stamps publishedAt when created with visibility=published', async () => {
    pushResult([bookRow({ id: 'pub1' })])
    await createBook({ title: 'Pub', visibility: 'published' })
    const inserted = insertValuesCalls[0] as Record<string, unknown>
    expect(inserted.visibility).toBe('published')
    expect(inserted.publishedAt).toBeInstanceOf(Date)
    expect(inserted.hiddenAt).toBeNull()
  })

  it('normalizes tags from comma-separated string', async () => {
    pushResult([bookRow({ id: 't1' })])
    await createBook({ title: 'T', tags: 'one, two, ,three' })
    const inserted = insertValuesCalls[0] as Record<string, unknown>
    expect(inserted.tags).toEqual(['one', 'two', 'three'])
  })

  it('normalizes pages from string to int, dropping invalid', async () => {
    pushResult([bookRow({ id: 'p1' })])
    await createBook({ title: 'P', pages: '250' })
    expect((insertValuesCalls[0] as Record<string, unknown>).pages).toBe(250)

    insertValuesCalls.length = 0
    pushResult([bookRow({ id: 'p2' })])
    await createBook({ title: 'P', pages: 'not a number' })
    expect((insertValuesCalls[0] as Record<string, unknown>).pages).toBeNull()
  })

  it('falls back to type=book when type is unknown', async () => {
    pushResult([bookRow({ id: 'k1' })])
    await createBook({ title: 'K', type: 'magazine' })
    expect((insertValuesCalls[0] as Record<string, unknown>).type).toBe('book')
  })

  it('accepts article type', async () => {
    pushResult([bookRow({ id: 'a1' })])
    await createBook({ title: 'A', type: 'article' })
    expect((insertValuesCalls[0] as Record<string, unknown>).type).toBe('article')
  })
})

describe('lib/books — updateBook', () => {
  it('returns null when book does not exist', async () => {
    pushResult([]) // current lookup → empty
    const result = await updateBook('missing', { title: 'X' })
    expect(result).toBeNull()
    expect(updateSetCalls).toHaveLength(0)
  })

  it('throws when title is set to empty', async () => {
    pushResult([bookRow({ id: 'b1' })])
    await expect(updateBook('b1', { title: '   ' })).rejects.toBeInstanceOf(BookValidationError)
  })

  it('throws when type is invalid', async () => {
    pushResult([bookRow({ id: 'b1' })])
    await expect(updateBook('b1', { type: 'magazine' })).rejects.toBeInstanceOf(BookValidationError)
  })

  it('throws when visibility is invalid', async () => {
    pushResult([bookRow({ id: 'b1' })])
    await expect(updateBook('b1', { visibility: 'archived' })).rejects.toBeInstanceOf(BookValidationError)
  })

  it('throws when readingStatus is invalid', async () => {
    pushResult([bookRow({ id: 'b1' })])
    await expect(updateBook('b1', { readingStatus: 'maybe' })).rejects.toBeInstanceOf(BookValidationError)
  })

  it('flipping visibility hidden->published stamps publishedAt and clears hiddenAt', async () => {
    pushResult([bookRow({ id: 'b1', visibility: 'hidden' })]) // current
    pushResult([bookRow({ id: 'b1', visibility: 'published' })]) // fetchBookById after update
    await updateBook('b1', { visibility: 'published' })
    const patch = updateSetCalls[0] as Record<string, unknown>
    expect(patch.visibility).toBe('published')
    expect(patch.publishedAt).toBeInstanceOf(Date)
    expect(patch.hiddenAt).toBeNull()
  })

  it('flipping visibility published->hidden stamps hiddenAt', async () => {
    pushResult([bookRow({ id: 'b1', visibility: 'published' })])
    pushResult([bookRow({ id: 'b1', visibility: 'hidden' })])
    await updateBook('b1', { visibility: 'hidden' })
    const patch = updateSetCalls[0] as Record<string, unknown>
    expect(patch.hiddenAt).toBeInstanceOf(Date)
  })

  it('keeping same visibility does not re-stamp publishedAt', async () => {
    pushResult([bookRow({ id: 'b1', visibility: 'published' })])
    pushResult([bookRow({ id: 'b1', visibility: 'published' })])
    await updateBook('b1', { visibility: 'published' })
    const patch = updateSetCalls[0] as Record<string, unknown>
    expect(patch.visibility).toBe('published')
    expect(patch.publishedAt).toBeUndefined()
  })

  it('readingStatus null clears the field', async () => {
    pushResult([bookRow({ id: 'b1', readingStatus: 'reading' })])
    pushResult([bookRow({ id: 'b1' })])
    await updateBook('b1', { readingStatus: null })
    expect((updateSetCalls[0] as Record<string, unknown>).readingStatus).toBeNull()
  })

  it('updates title without migration-only canonical key bookkeeping', async () => {
    pushResult([bookRow({ id: 'b1', title: 'Old', author: 'A' })])
    pushResult([bookRow({ id: 'b1', title: 'New', author: 'A' })])
    await updateBook('b1', { title: 'New Title' })
    const patch = updateSetCalls[0] as Record<string, unknown>
    expect(patch.title).toBe('New Title')
    expect(patch).not.toHaveProperty('canonicalKey')
  })

  it('normalizes tags input', async () => {
    pushResult([bookRow({ id: 'b1' })])
    pushResult([bookRow({ id: 'b1' })])
    await updateBook('b1', { tags: 'a, b, c' })
    expect((updateSetCalls[0] as Record<string, unknown>).tags).toEqual(['a', 'b', 'c'])
  })

  it('only updates fields that were passed', async () => {
    pushResult([bookRow({ id: 'b1', title: 'Keep' })])
    pushResult([bookRow({ id: 'b1', title: 'Keep' })])
    await updateBook('b1', { isNew: true })
    const patch = updateSetCalls[0] as Record<string, unknown>
    expect(patch.isNew).toBe(true)
    expect(patch.title).toBeUndefined()
    expect(patch.author).toBeUndefined()
  })
})
