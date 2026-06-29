/**
 * @jest-environment node
 */
const selectResults: unknown[][] = []
const insertedValues: unknown[] = []
const deletedWheres: unknown[] = []
const auditContexts: unknown[] = []
let failInsert: Error | null = null

function enqueue(...rows: unknown[][]) {
  selectResults.push(...rows)
}

function pull(): Promise<unknown[]> {
  return Promise.resolve(selectResults.shift() ?? [])
}

jest.mock('@/lib/db', () => {
  type Chain = {
    from: jest.Mock<Chain, []>
    where: jest.Mock<Chain, []>
    limit: jest.Mock<Chain, []>
    then: <T>(onFulfilled: (value: unknown[]) => T) => Promise<T>
  }

  function chain(): Chain {
    const value = {} as Chain
    value.from = jest.fn(() => value)
    value.where = jest.fn(() => value)
    value.limit = jest.fn(() => value)
    value.then = <T,>(onFulfilled: (rows: unknown[]) => T) => pull().then(onFulfilled)
    return value
  }

  return {
    db: {
      select: jest.fn(() => chain()),
      insert: jest.fn(() => ({
        values: jest.fn((values: unknown) => {
          insertedValues.push(values)
          return {
            onConflictDoNothing: jest.fn(() => {
              if (failInsert) return Promise.reject(failInsert)
              return Promise.resolve()
            }),
          }
        }),
      })),
      delete: jest.fn(() => ({
        where: jest.fn((where: unknown) => {
          deletedWheres.push(where)
          return Promise.resolve()
        }),
      })),
    },
  }
})

jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: jest.fn((context: unknown, fn: (tx: unknown) => unknown) => {
    auditContexts.push(context)
    return fn(jest.requireMock('@/lib/db').db)
  }),
}))

import {
  SUMMARY_HELPFUL_COOKIE,
  SUMMARY_HELPFUL_COOKIE_PATH,
  SUMMARY_HELPFUL_MAX_AGE,
  SummaryHelpfulNotFoundError,
  addSummaryHelpful,
  createHelpfulVisitorActor,
  getSummaryHelpfulState,
  hashHelpfulVisitorCookie,
  hashHelpfulVisitorId,
  reconcileSummaryHelpful,
  removeSummaryHelpful,
} from './summary-helpful'

beforeEach(() => {
  selectResults.length = 0
  insertedValues.length = 0
  deletedWheres.length = 0
  auditContexts.length = 0
  failInsert = null
})

describe('helpful visitor identity', () => {
  it('uses the approved scoped cookie contract', () => {
    expect(SUMMARY_HELPFUL_COOKIE).toBe('__Secure-summary-helpful')
    expect(SUMMARY_HELPFUL_COOKIE_PATH).toBe('/api/summaries')
    expect(SUMMARY_HELPFUL_MAX_AGE).toBe(31_536_000)
  })

  it('validates canonical UUIDs and hashes them stably', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000'
    expect(hashHelpfulVisitorId(id)).toBe('a3a9e1ed9732cab28868127be00f1ce921acaefdd5c3b23a6e9e0072bd9c1a34')
    expect(hashHelpfulVisitorCookie(id)).toBe(hashHelpfulVisitorId(id))
    expect(hashHelpfulVisitorCookie('not-a-uuid')).toBeNull()
    expect(hashHelpfulVisitorCookie(id.toUpperCase())).toBeNull()
    expect(hashHelpfulVisitorCookie(`{${id}}`)).toBeNull()
  })

  it('creates a new visitor actor whose hash matches its UUID', () => {
    const actor = createHelpfulVisitorActor()
    expect(actor.kind).toBe('new-visitor')
    expect(hashHelpfulVisitorCookie(actor.visitorId)).toBe(actor.visitorHash)
  })
})

describe('summary helpful state and mutations', () => {
  it('returns a public count without claiming a guest reacted when there is no actor', async () => {
    enqueue([{ id: 's1' }], [{ count: 3 }])
    await expect(getSummaryHelpfulState('s1', null)).resolves.toEqual({ count: 3, reacted: false })
  })

  it('returns personalized state for a visitor and account', async () => {
    enqueue([{ id: 's1' }], [{ count: 2 }], [{ id: 'r1' }])
    await expect(getSummaryHelpfulState('s1', { kind: 'visitor', visitorHash: 'hash' }))
      .resolves.toEqual({ count: 2, reacted: true })

    enqueue([{ id: 's1' }], [{ count: 4 }], [])
    await expect(getSummaryHelpfulState('s1', { kind: 'user', userId: 'u1' }))
      .resolves.toEqual({ count: 4, reacted: false })
  })

  it('hides missing and unpublished summaries behind the same not-found error', async () => {
    enqueue([])
    await expect(getSummaryHelpfulState('draft', null)).rejects.toBeInstanceOf(SummaryHelpfulNotFoundError)
  })

  it('adds a guest reaction idempotently and returns authoritative state', async () => {
    enqueue([{ id: 's1' }], [{ count: 1 }], [{ id: 'r1' }])
    const state = await addSummaryHelpful('s1', { kind: 'visitor', visitorHash: 'hash' })

    expect(state).toEqual({ count: 1, reacted: true })
    expect(insertedValues).toHaveLength(1)
    expect(insertedValues[0]).toMatchObject({ summaryId: 's1', visitorHash: 'hash', userId: null })
    expect(auditContexts).toContainEqual({ source: 'summary-helpful', actorUserId: null })
  })

  it('keeps repeated delete successful with no guest identity', async () => {
    enqueue([{ id: 's1' }], [{ count: 0 }])
    await expect(removeSummaryHelpful('s1', null)).resolves.toEqual({ count: 0, reacted: false })
    expect(deletedWheres).toHaveLength(0)
  })

  it('reconciles all browser reactions into one account identity atomically', async () => {
    enqueue(
      [{ id: 's1' }],
      [{ summaryId: 's1' }, { summaryId: 's2' }],
      [{ count: 1 }],
      [{ id: 'account-reaction' }],
    )

    await expect(reconcileSummaryHelpful('s1', 'u1', 'visitor-hash'))
      .resolves.toEqual({ count: 1, reacted: true })

    expect(insertedValues).toEqual([
      { summaryId: 's1', userId: 'u1', visitorHash: null },
      { summaryId: 's2', userId: 'u1', visitorHash: null },
    ])
    expect(deletedWheres).toHaveLength(1)
    expect(auditContexts).toContainEqual({ source: 'summary-helpful', actorUserId: 'u1' })
  })

  it('reconciles before an account add so a cross-device conflict stays deduplicated', async () => {
    enqueue(
      [{ id: 's1' }],
      [{ summaryId: 's1' }],
      [{ count: 1 }],
      [{ id: 'account-reaction' }],
    )

    await expect(addSummaryHelpful('s1', { kind: 'user', userId: 'u1', visitorHash: 'visitor-hash' }))
      .resolves.toEqual({ count: 1, reacted: true })

    expect(insertedValues).toHaveLength(2)
    expect(deletedWheres).toHaveLength(1)
  })

  it('propagates transaction failures instead of returning optimistic state', async () => {
    failInsert = new Error('db unavailable')
    enqueue([{ id: 's1' }])
    await expect(addSummaryHelpful('s1', { kind: 'visitor', visitorHash: 'secret-hash' }))
      .rejects.toThrow('db unavailable')
  })
})
