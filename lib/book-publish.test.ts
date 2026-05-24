/**
 * @jest-environment node
 */
interface DbMocks {
  limit: jest.Mock
  from: jest.Mock
  updateWhere: jest.Mock
  update: jest.Mock
  insertValues: jest.Mock
  insert: jest.Mock
  sql: jest.Mock
}

jest.mock('@/lib/db', () => {
  const mocks: DbMocks = {
    limit: jest.fn(),
    from: jest.fn(),
    updateWhere: jest.fn(),
    update: jest.fn(),
    insertValues: jest.fn(),
    insert: jest.fn(),
    sql: jest.fn(),
  }
  const mockWhere = jest.fn(() => ({ limit: mocks.limit }))
  mocks.from.mockImplementation(() => ({ where: mockWhere }))
  const mockSelect = jest.fn(() => ({ from: mocks.from }))
  const mockUpdateSet = jest.fn(() => ({ where: mocks.updateWhere }))
  mocks.update.mockImplementation(() => ({ set: mockUpdateSet }))
  mocks.insert.mockImplementation(() => ({ values: mocks.insertValues }))
  return {
    db: {
      select: mockSelect,
      update: mocks.update,
      insert: mocks.insert,
    },
    sql: (...args: unknown[]) => mocks.sql(...args),
    __bookPublishDbMocks: mocks,
  }
})

import { publishSubmissionAsBook } from './book-publish'
import * as dbModule from '@/lib/db'
import { bookSubmissions, books } from './db/schema'

const dbMocks = (dbModule as unknown as { __bookPublishDbMocks: DbMocks }).__bookPublishDbMocks

const submission = {
  id: 'sub-1',
  userId: 'user-1',
  title: 'Title',
  author: 'Author',
  topic: 'Topic',
  pages: 123,
  publishedDate: '2026',
  textUrl: 'https://example.com',
  description: 'Description',
  coverUrl: null,
  whyRead: 'Why',
}

describe('publishSubmissionAsBook', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    dbMocks.updateWhere.mockResolvedValue(undefined)
    dbMocks.insertValues.mockResolvedValue(undefined)
    dbMocks.sql.mockResolvedValue(undefined)
  })

  it('reuses linked book_submissions.book_id for idempotent approvals', async () => {
    dbMocks.limit.mockResolvedValue([{ bookId: 'book-1' }])

    const bookId = await publishSubmissionAsBook(submission)

    expect(bookId).toBe('book-1')
    expect(dbMocks.from).toHaveBeenCalledWith(bookSubmissions)
    expect(dbMocks.update).toHaveBeenCalledWith(books)
    expect(dbMocks.insert).not.toHaveBeenCalledWith(books)
  })

  it('creates a book without migration-only fields for a first approval', async () => {
    dbMocks.limit.mockResolvedValue([])

    const bookId = await publishSubmissionAsBook(submission)

    expect(bookId).toEqual(expect.any(String))
    expect(dbMocks.insert).toHaveBeenCalledWith(books)
    const values = dbMocks.insertValues.mock.calls[0][0] as Record<string, unknown>
    expect(values).toMatchObject({
      title: 'Title',
      author: 'Author',
      source: 'submission',
      visibility: 'published',
    })
    expect(values).not.toHaveProperty('canonicalKey')
    expect(values).not.toHaveProperty('sourceSubmissionId')
    expect(values).not.toHaveProperty('legacySheetsRowId')
  })
})
