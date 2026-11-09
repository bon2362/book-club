jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('drizzle-orm', () => ({ sql: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })) }))
jest.mock('@/lib/cache/home-public-tag', () => ({ invalidateHomePublicCache: jest.fn() }))

import { withAuditContext } from './with-audit-context'
import { invalidateHomePublicCache } from '@/lib/cache/home-public-tag'

const execute = jest.fn()
const fakeTx = { execute }
const fakeDb = {
  transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(fakeTx)),
}
const invalidate = invalidateHomePublicCache as jest.Mock

describe('withAuditContext', () => {
  beforeEach(() => {
    execute.mockReset()
    fakeDb.transaction.mockClear()
    invalidate.mockClear()
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

  it('сбрасывает кэш главной после успешной транзакции', async () => {
    const order: string[] = []
    fakeDb.transaction.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
      const value = await cb(fakeTx)
      order.push('commit')
      return value
    })
    invalidate.mockImplementationOnce(() => order.push('invalidate'))

    await withAuditContext({ source: 'admin' }, async () => 'ok', fakeDb as never)

    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['commit', 'invalidate'])
  })

  it('не сбрасывает кэш, если транзакция откатилась', async () => {
    await expect(
      withAuditContext({ source: 'admin' }, async () => { throw new Error('boom') }, fakeDb as never),
    ).rejects.toThrow('boom')
    expect(invalidate).not.toHaveBeenCalled()
  })
})
