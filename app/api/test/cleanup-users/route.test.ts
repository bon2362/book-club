/**
 * @jest-environment node
 */

import { DELETE } from './route'

jest.mock('@/lib/db', () => ({
  db: {
    execute: jest.fn(),
  },
}))
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) =>
    fn((jest.requireMock('@/lib/db') as { db: unknown }).db),
}))

import { db } from '@/lib/db'

function setNodeEnv(value: string) {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    configurable: true,
  })
}

describe('DELETE /api/test/cleanup-users', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalTestMode = process.env.NEXTAUTH_TEST_MODE

  afterEach(() => {
    setNodeEnv(originalNodeEnv)
    if (originalTestMode === undefined) {
      delete process.env.NEXTAUTH_TEST_MODE
    } else {
      process.env.NEXTAUTH_TEST_MODE = originalTestMode
    }
    jest.clearAllMocks()
  })

  it('[SEC] возвращает 403 в production даже если NEXTAUTH_TEST_MODE=true', async () => {
    setNodeEnv('production')
    process.env.NEXTAUTH_TEST_MODE = 'true'

    const res = await DELETE()

    expect(res.status).toBe(403)
    expect(db.execute).not.toHaveBeenCalled()
  })

  it('удаляет E2E-хвосты в test mode', async () => {
    setNodeEnv('test')
    process.env.NEXTAUTH_TEST_MODE = 'true'
    ;(db.execute as jest.Mock).mockResolvedValue({
      rows: [{ users: 2, identities: 2, feedback: 1, notifications: 0, matchingSessions: 3 }],
    })

    const res = await DELETE()

    expect(res.status).toBe(200)
    expect(db.execute).toHaveBeenCalled()
    const sqlText = JSON.stringify((db.execute as jest.Mock).mock.calls[0][0])
    expect(sqlText).toContain('matching_sessions')
    // Age-gate: общая e2e-ветка, параллельный прогон не должен терять живых
    // пользователей. Каждый удаляющий CTE обязан фильтровать по created_at.
    expect(sqlText.match(/interval '2 hours'/g)?.length ?? 0).toBeGreaterThanOrEqual(5)
    await expect(res.json()).resolves.toEqual({
      ok: true,
      deleted: { users: 2, identities: 2, feedback: 1, notifications: 0, matchingSessions: 3 },
    })
  })
})
