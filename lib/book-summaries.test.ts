/**
 * @jest-environment node
 */
const queue: unknown[][] = []
const insertValuesCalls: unknown[] = []
const updateSetCalls: unknown[] = []
const deleteWhereCalls: unknown[] = []
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
      delete: jest.fn(() => ({
        where: jest.fn((value: unknown) => {
          deleteWhereCalls.push(value)
          return { returning: jest.fn(() => pullResult()) }
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
  adminPublishSummaryRevision,
  adminPublishSummary,
  adminRejectSummaryRevision,
  adminRejectSummary,
  getActiveSummaryRevision,
  getAuthorSummaryById,
  getPublishedSummaryCounts,
  listAdminSummaryRevisions,
  normalizeSummaryPatch,
  openOrCreateSummaryRevision,
  openOrCreateSummaryDraft,
  saveAuthorSummaryRevision,
  saveAuthorSummary,
  submitAuthorSummaryRevision,
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

function revisionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    summaryId: 's1',
    displayName: 'Алина',
    title: 'Новая версия',
    tldr: 'Новое коротко',
    bodyMarkdown: 'Новый текст',
    status: 'draft',
    rejectionReason: null,
    submittedAt: null,
    createdAt: new Date('2026-06-02T10:00:00Z'),
    updatedAt: new Date('2026-06-02T10:00:00Z'),
    bookId: 'b1',
    authorUserId: 'u1',
    bookTitle: 'Книга',
    bookAuthor: 'Автор',
    authorName: 'Алина Аккаунт',
    authorEmail: 'a@example.test',
    publishedDisplayName: 'Алина',
    publishedTitle: 'Институты',
    publishedTldr: 'Коротко',
    publishedBodyMarkdown: 'Текст',
    publishedAt: new Date('2026-06-01T12:00:00Z'),
    ...overrides,
  }
}

beforeEach(() => {
  queue.length = 0
  insertValuesCalls.length = 0
  updateSetCalls.length = 0
  deleteWhereCalls.length = 0
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

describe('published summary revisions', () => {
  it('returns an active revision for a summary', async () => {
    pushResult([revisionRow()])

    await expect(getActiveSummaryRevision('s1')).resolves.toMatchObject({
      id: 'r1',
      summaryId: 's1',
      status: 'draft',
    })
  })

  it('creates a draft revision copied from a published summary', async () => {
    pushResult([summaryRow({ status: 'published', publishedAt: new Date('2026-06-01T12:00:00Z') })])
    pushResult([]) // existing revision
    pushResult([{ bookId: 'b1' }]) // personal read signup
    pushResult([revisionRow()])

    const result = await openOrCreateSummaryRevision({
      summaryId: 's1',
      userId: 'u1',
      actorLabel: 'Алина',
    })

    expect(result.id).toBe('r1')
    expect(insertValuesCalls[0]).toMatchObject({
      summaryId: 's1',
      displayName: 'Алина',
      title: 'Институты',
      tldr: 'Коротко',
      bodyMarkdown: 'Текст',
      status: 'draft',
    })
    expect(auditContexts[0]).toMatchObject({ actorUserId: 'u1', source: 'summary' })
  })

  it('returns the existing active revision without inserting', async () => {
    pushResult([summaryRow({ status: 'published' })])
    pushResult([revisionRow({ id: 'existing' })])

    const result = await openOrCreateSummaryRevision({
      summaryId: 's1',
      userId: 'u1',
      actorLabel: 'Алина',
    })

    expect(result.id).toBe('existing')
    expect(insertValuesCalls).toHaveLength(0)
  })

  it('rejects revision creation for a non-published summary', async () => {
    pushResult([summaryRow({ status: 'pending' })])

    await expect(openOrCreateSummaryRevision({
      summaryId: 's1',
      userId: 'u1',
      actorLabel: 'Алина',
    })).rejects.toThrow(new SummaryValidationError('published summary is required'))
  })

  it('requires the book to remain read before creating a revision', async () => {
    pushResult([summaryRow({ status: 'published' })])
    pushResult([]) // existing revision
    pushResult([]) // personal read signup

    await expect(openOrCreateSummaryRevision({
      summaryId: 's1',
      userId: 'u1',
      actorLabel: 'Алина',
    })).rejects.toThrow(new SummaryValidationError('book must be marked as read'))
  })

  it('allows author autosave for draft revisions', async () => {
    pushResult([revisionRow({ status: 'draft' })])
    pushResult([revisionRow({ title: 'Исправлено' })])

    const result = await saveAuthorSummaryRevision({
      id: 'r1',
      userId: 'u1',
      actorLabel: 'Алина',
      patch: { title: '  Исправлено  ' },
    })

    expect(result.title).toBe('Исправлено')
    expect(updateSetCalls[0]).toMatchObject({ title: 'Исправлено' })
  })

  it('blocks author autosave for pending revisions', async () => {
    pushResult([revisionRow({ status: 'pending' })])

    await expect(saveAuthorSummaryRevision({
      id: 'r1',
      userId: 'u1',
      actorLabel: 'Алина',
      patch: { title: 'Исправлено' },
    })).rejects.toThrow(new SummaryValidationError('summary revision is not editable by author'))
    expect(updateSetCalls).toHaveLength(0)
  })

  it('submits a complete rejected revision after checking read status', async () => {
    pushResult([revisionRow({ status: 'rejected', rejectionReason: 'Уточнить' })])
    pushResult([{ bookId: 'b1' }])
    pushResult([revisionRow({ status: 'pending', rejectionReason: null })])

    const result = await submitAuthorSummaryRevision({
      id: 'r1',
      userId: 'u1',
      actorLabel: 'Алина',
    })

    expect(result.status).toBe('pending')
    expect(updateSetCalls[0]).toMatchObject({ status: 'pending', rejectionReason: null })
  })

  it('lists revisions with published, book, and author metadata', async () => {
    pushResult([revisionRow({ status: 'pending' })])

    await expect(listAdminSummaryRevisions()).resolves.toEqual([
      expect.objectContaining({
        id: 'r1',
        summaryId: 's1',
        bookId: 'b1',
        authorUserId: 'u1',
        publishedTitle: 'Институты',
      }),
    ])
  })

  it('rejects a revision without changing the published summary', async () => {
    pushResult([revisionRow({ status: 'pending' })])
    pushResult([revisionRow({ status: 'rejected', rejectionReason: 'Уточнить вывод' })])

    const result = await adminRejectSummaryRevision({
      id: 'r1',
      adminUserId: 'admin',
      actorLabel: 'Admin',
      rejectionReason: 'Уточнить вывод',
    })

    expect(result.status).toBe('rejected')
    expect(updateSetCalls[0]).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Уточнить вывод',
    })
    expect(deleteWhereCalls).toHaveLength(0)
  })

  it('applies a revision atomically and preserves publishedAt', async () => {
    const publishedAt = new Date('2026-06-01T12:00:00Z')
    pushResult([revisionRow({ status: 'pending', publishedAt })]) // select joined revision
    pushResult([summaryRow({
      status: 'published',
      title: 'Новая версия',
      publishedAt,
    })]) // updated summary
    pushResult([revisionRow({ status: 'pending' })]) // deleted revision

    const result = await adminPublishSummaryRevision({
      id: 'r1',
      adminUserId: 'admin',
      actorLabel: 'Admin',
    })

    expect(result.title).toBe('Новая версия')
    expect(result.publishedAt).toEqual(publishedAt)
    expect(updateSetCalls[0]).toMatchObject({
      displayName: 'Алина',
      title: 'Новая версия',
      tldr: 'Новое коротко',
      bodyMarkdown: 'Новый текст',
    })
    expect(updateSetCalls[0]).not.toHaveProperty('publishedAt')
    expect(deleteWhereCalls).toHaveLength(1)
    expect(auditContexts[0]).toMatchObject({ actorUserId: 'admin', source: 'admin' })
  })
})
