/**
 * @jest-environment node
 */
const queue: unknown[][] = []
const insertValuesCalls: unknown[] = []
const updateSetCalls: unknown[] = []
const auditContexts: unknown[] = []

function pushResult(rows: unknown[]) { queue.push(rows) }
function pullResult(): Promise<unknown[]> {
  return Promise.resolve(queue.length > 0 ? queue.shift()! : [])
}

jest.mock('@/lib/db', () => {
  type SelectChain = {
    from: jest.Mock<SelectChain, []>
    leftJoin: jest.Mock<SelectChain, []>
    innerJoin: jest.Mock<SelectChain, []>
    where: jest.Mock<SelectChain, []>
    groupBy: jest.Mock<SelectChain, []>
    orderBy: jest.Mock<SelectChain, []>
    limit: jest.Mock<SelectChain, []>
    then: <T>(onFulfilled: (value: unknown[]) => T) => Promise<T>
  }

  function selectChain(): SelectChain {
    const chain = {} as SelectChain
    chain.from = jest.fn(() => chain)
    chain.leftJoin = jest.fn(() => chain)
    chain.innerJoin = jest.fn(() => chain)
    chain.where = jest.fn(() => chain)
    chain.groupBy = jest.fn(() => chain)
    chain.orderBy = jest.fn(() => chain)
    chain.limit = jest.fn(() => chain)
    chain.then = <T,>(onFulfilled: (value: unknown[]) => T) => pullResult().then(onFulfilled)
    return chain
  }

  return {
    db: {
      select: jest.fn(() => selectChain()),
      insert: jest.fn(() => ({
        values: jest.fn((value: unknown) => {
          insertValuesCalls.push(value)
          return { returning: jest.fn(() => pullResult()) }
        }),
      })),
      update: jest.fn(() => ({
        set: jest.fn((value: unknown) => {
          updateSetCalls.push(value)
          return { where: jest.fn(() => ({ returning: jest.fn(() => pullResult()) })) }
        }),
      })),
    },
  }
})

jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: jest.fn((ctx: unknown, fn: (tx: unknown) => unknown) => {
    auditContexts.push(ctx)
    return fn(jest.requireMock('@/lib/db').db)
  }),
}))

import {
  SummaryValidationError,
  adminPublishSummary,
  adminRejectSummary,
  getAuthorSummaryById,
  getPublishedSummaryCounts,
  normalizeSummaryPatch,
  openOrCreateSummaryDraft,
  saveAuthorSummary,
  submitAuthorSummary,
} from './book-summaries'

function summaryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    bookId: 'b1',
    authorUserId: 'u1',
    displayName: 'Алина',
    title: 'Институты',
    tldr: 'Коротко',
    bodyMarkdown: 'Текст',
    status: 'draft',
    rejectionReason: null,
    submittedAt: null,
    publishedAt: null,
    createdAt: new Date('2026-06-01T10:00:00Z'),
    updatedAt: new Date('2026-06-01T10:00:00Z'),
    bookTitle: 'Книга',
    bookAuthor: 'Автор',
    authorName: 'Алина Аккаунт',
    authorEmail: 'a@example.test',
    ...overrides,
  }
}

beforeEach(() => {
  queue.length = 0
  insertValuesCalls.length = 0
  updateSetCalls.length = 0
  auditContexts.length = 0
})

describe('normalizeSummaryPatch', () => {
  it('trims string fields and ignores unknown keys', () => {
    expect(normalizeSummaryPatch({
      displayName: '  alina.reads  ',
      title: '  Заголовок ',
      tldr: '  В двух словах ',
      bodyMarkdown: '  **текст**  ',
      ignored: 'x',
    })).toEqual({
      displayName: 'alina.reads',
      title: 'Заголовок',
      tldr: 'В двух словах',
      bodyMarkdown: '**текст**',
    })
  })
})

describe('openOrCreateSummaryDraft', () => {
  it('requires a personal read signup before creating a draft', async () => {
    pushResult([]) // existing summary
    pushResult([]) // personal read signup

    await expect(openOrCreateSummaryDraft({
      bookId: 'b1',
      userId: 'u1',
      actorLabel: 'Алина',
      defaultDisplayName: 'Алина',
    })).rejects.toThrow(new SummaryValidationError('book must be marked as read'))
    expect(insertValuesCalls).toHaveLength(0)
  })

  it('returns an existing summary instead of inserting a duplicate', async () => {
    pushResult([summaryRow({ id: 'existing', status: 'rejected' })])

    const result = await openOrCreateSummaryDraft({
      bookId: 'b1',
      userId: 'u1',
      actorLabel: 'Алина',
      defaultDisplayName: 'Алина',
    })

    expect(result.id).toBe('existing')
    expect(result.status).toBe('rejected')
    expect(insertValuesCalls).toHaveLength(0)
  })

  it('creates a draft with the default display name through audit context', async () => {
    pushResult([]) // existing summary
    pushResult([{ bookId: 'b1' }]) // personal read signup
    pushResult([summaryRow({ id: 'created', displayName: 'Алина' })])

    const result = await openOrCreateSummaryDraft({
      bookId: 'b1',
      userId: 'u1',
      actorLabel: 'Алина',
      defaultDisplayName: '  Алина  ',
    })

    expect(result.id).toBe('created')
    expect(insertValuesCalls[0]).toMatchObject({
      bookId: 'b1',
      authorUserId: 'u1',
      displayName: 'Алина',
      status: 'draft',
    })
    expect(auditContexts[0]).toMatchObject({ actorUserId: 'u1', source: 'summary' })
  })
})

describe('saveAuthorSummary', () => {
  it('returns an author summary by id only for its owner', async () => {
    pushResult([summaryRow({ id: 's1', authorUserId: 'u1' })])
    await expect(getAuthorSummaryById('s1', 'u1')).resolves.toMatchObject({ id: 's1' })

    pushResult([summaryRow({ id: 's1', authorUserId: 'u2' })])
    await expect(getAuthorSummaryById('s1', 'u1')).resolves.toBeNull()
  })

  it('allows author autosave for draft and stores normalized fields', async () => {
    pushResult([summaryRow({ status: 'draft' })])
    pushResult([summaryRow({ title: 'Новый' })])

    const result = await saveAuthorSummary({
      id: 's1',
      userId: 'u1',
      actorLabel: 'Алина',
      patch: { title: '  Новый  ' },
    })

    expect(result.title).toBe('Новый')
    expect(updateSetCalls[0]).toMatchObject({ title: 'Новый' })
  })

  it('blocks author autosave for pending', async () => {
    pushResult([summaryRow({ status: 'pending' })])

    await expect(saveAuthorSummary({
      id: 's1',
      userId: 'u1',
      actorLabel: 'Алина',
      patch: { title: 'Новый' },
    })).rejects.toThrow(new SummaryValidationError('summary is not editable by author'))
    expect(updateSetCalls).toHaveLength(0)
  })
})

describe('submitAuthorSummary', () => {
  it('validates required fields before moving to pending', async () => {
    pushResult([summaryRow({ tldr: '   ', status: 'draft' })])

    await expect(submitAuthorSummary({
      id: 's1',
      userId: 'u1',
      actorLabel: 'Алина',
    })).rejects.toThrow(new SummaryValidationError('tldr is required'))
  })

  it('checks read status and moves a complete rejected summary back to pending', async () => {
    pushResult([summaryRow({ status: 'rejected', rejectionReason: 'Доработать' })])
    pushResult([{ bookId: 'b1' }])
    pushResult([summaryRow({ status: 'pending', rejectionReason: null })])

    const result = await submitAuthorSummary({ id: 's1', userId: 'u1', actorLabel: 'Алина' })

    expect(result.status).toBe('pending')
    expect(updateSetCalls[0]).toMatchObject({ status: 'pending', rejectionReason: null })
  })
})

describe('admin moderation and published counts', () => {
  it('rejects only with a non-empty reason', async () => {
    await expect(adminRejectSummary({
      id: 's1',
      adminUserId: 'admin',
      actorLabel: 'Admin',
      rejectionReason: '   ',
    })).rejects.toThrow(new SummaryValidationError('rejection reason is required'))
  })

  it('publishes through admin audit context and clears rejection reason', async () => {
    pushResult([summaryRow({ status: 'published' })])

    const result = await adminPublishSummary({ id: 's1', adminUserId: 'admin', actorLabel: 'Admin' })

    expect(result.status).toBe('published')
    expect(updateSetCalls[0]).toMatchObject({ status: 'published', rejectionReason: null })
    expect(updateSetCalls[0]).toHaveProperty('publishedAt')
    expect(auditContexts[0]).toMatchObject({ actorUserId: 'admin', source: 'admin' })
  })

  it('returns published summary counts by book', async () => {
    pushResult([{ bookId: 'b1', count: 2 }, { bookId: 'b2', count: 1 }])

    await expect(getPublishedSummaryCounts()).resolves.toEqual(new Map([
      ['b1', 2],
      ['b2', 1],
    ]))
  })
})
