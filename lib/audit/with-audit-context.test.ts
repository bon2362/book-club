jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('drizzle-orm', () => ({ sql: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })) }))

import { withAuditContext } from './with-audit-context'

const execute = jest.fn()
const fakeTx = { execute }
const fakeDb = {
  transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(fakeTx)),
}

describe('withAuditContext', () => {
  beforeEach(() => {
    execute.mockReset()
    fakeDb.transaction.mockClear()
  })

  it('sets transaction-local audit settings then runs the body in the tx', async () => {
    const body = jest.fn(async () => 'result')
    const result = await withAuditContext(
      { actorUserId: 'u1', actorLabel: 'Вася', source: 'admin', reason: 'spam' },
      body,
      fakeDb as never,
    )

    expect(result).toBe('result')
    expect(fakeDb.transaction).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledTimes(4)
    expect(body).toHaveBeenCalledWith(fakeTx)
  })

  it('passes empty string (not null) when optional fields are absent', async () => {
    await withAuditContext({ source: 'cron' }, async () => undefined, fakeDb as never)
    expect(execute).toHaveBeenCalledTimes(4)
  })
})
