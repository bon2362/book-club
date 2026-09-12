import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { executeMatchingTransition, type MatchingTransitionStore } from '@/lib/matching/session-transition'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { reportMatchingEvents } from '@/lib/matching-analytics'

jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('@/lib/matching-analytics', () => ({ reportMatchingEvents: jest.fn() }))
jest.mock('@/lib/audit/with-audit-context', () => ({ withAuditContext: jest.fn() }))
jest.mock('@/lib/matching/session-transition', () => ({
  ...jest.requireActual('@/lib/matching/session-transition'),
  executeMatchingTransition: jest.fn(),
}))

const withAuditMock = withAuditContext as jest.Mock
const executeMock = executeMatchingTransition as jest.Mock
const reportMock = reportMatchingEvents as jest.Mock

const fakeTx = {
  insert: jest.fn(() => ({ values: jest.fn().mockResolvedValue(undefined) })),
  select: jest.fn(),
}

const draft = { eventType: 'leave', stateVersion: 2 }
const input = {
  sessionId: 's1',
  actor: { userId: 'user-1', label: 'Иван', source: 'user' },
  action: { type: 'leave' } as never,
}

describe('runMatchingTransition: аналитика', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    executeMock.mockImplementation(async (_input: unknown, store: MatchingTransitionStore) => {
      await store.writeEvents('s1', [draft])
      return { changed: true, stateVersion: 2 }
    })
  })

  it('отправляет записанные события после коммита транзакции', async () => {
    const order: string[] = []
    withAuditMock.mockImplementation(async (_ctx: unknown, callback: (tx: unknown) => Promise<unknown>) => {
      const result = await callback(fakeTx)
      order.push('commit')
      return result
    })
    reportMock.mockImplementation(async () => { order.push('report') })

    await expect(runMatchingTransition(input)).resolves.toEqual({ changed: true, stateVersion: 2 })

    expect(reportMock).toHaveBeenCalledWith('s1', input.actor, [draft])
    expect(order).toEqual(['commit', 'report'])
  })

  it('ничего не отправляет, если транзакция откатилась', async () => {
    withAuditMock.mockImplementation(async (_ctx: unknown, callback: (tx: unknown) => Promise<unknown>) => {
      await callback(fakeTx)
      throw new Error('rollback')
    })

    await expect(runMatchingTransition(input)).rejects.toThrow('rollback')
    expect(reportMock).not.toHaveBeenCalled()
  })
})
