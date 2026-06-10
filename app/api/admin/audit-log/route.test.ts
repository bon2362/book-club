/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET } from './route'
import { auth } from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))

// Two select chains:
// 1. count-chain: select({count}).from().where?()  → resolves to [{ count: 0 }]
// 2. rows-chain:  select().from().where?().orderBy().limit().offset() → resolves to []
// We distinguish them by the presence of .offset() at the end.
jest.mock('@/lib/db', () => {
  function buildCountChain() {
    const chain: Record<string, unknown> = {}
    const terminal = Promise.resolve([{ count: 0 }])
    chain.from = jest.fn(() => chain)
    chain.where = jest.fn(() => chain)
    chain.then = terminal.then.bind(terminal)
    chain.catch = terminal.catch.bind(terminal)
    chain.finally = terminal.finally.bind(terminal)
    return chain
  }

  function buildRowsChain() {
    const chain: Record<string, unknown> = {}
    const terminal = Promise.resolve([])
    chain.from = jest.fn(() => chain)
    chain.where = jest.fn(() => chain)
    chain.orderBy = jest.fn(() => chain)
    chain.limit = jest.fn(() => chain)
    chain.offset = jest.fn(() => {
      // terminal — return a thenable that resolves to []
      return terminal
    })
    return chain
  }

  let callCount = 0
  return {
    db: {
      select: jest.fn(() => {
        // First call = count query, second call = rows query
        callCount++
        if (callCount % 2 === 1) return buildCountChain()
        return buildRowsChain()
      }),
    },
    sql: jest.fn(() => ({
      mapWith: jest.fn().mockReturnValue('count(*)')
    })),
  }
})

const mockedAuth = auth as unknown as jest.Mock

function req(url = 'http://localhost/api/admin/audit-log') {
  return new NextRequest(url)
}

beforeEach(() => {
  // Reset call counter so each test gets fresh count/rows chains
  const dbModule = jest.requireMock('@/lib/db') as { db: { select: jest.Mock } }
  dbModule.db.select.mockClear()
  // Re-reset the counter via reimplementing
  let callCount = 0
  dbModule.db.select.mockImplementation(() => {
    callCount++
    if (callCount % 2 === 1) {
      // count chain
      const chain: Record<string, unknown> = {}
      const terminal = Promise.resolve([{ count: 0 }])
      chain.from = jest.fn(() => chain)
      chain.where = jest.fn(() => chain)
      chain.then = terminal.then.bind(terminal)
      chain.catch = terminal.catch.bind(terminal)
      chain.finally = terminal.finally.bind(terminal)
      return chain
    } else {
      // rows chain
      const chain: Record<string, unknown> = {}
      const rowsTerminal = Promise.resolve([])
      chain.from = jest.fn(() => chain)
      chain.where = jest.fn(() => chain)
      chain.orderBy = jest.fn(() => chain)
      chain.limit = jest.fn(() => chain)
      chain.offset = jest.fn(() => rowsTerminal)
      return chain
    }
  })
})

describe('GET /api/admin/audit-log', () => {
  it('rejects non-admins with 403', async () => {
    mockedAuth.mockResolvedValueOnce({ user: { isAdmin: false } })
    const res = await GET(req())
    expect(res.status).toBe(403)
  })

  it('returns 200 for admins', async () => {
    mockedAuth.mockResolvedValueOnce({ user: { isAdmin: true } })
    const res = await GET(req())
    expect(res.status).toBe(200)
  })

  it('returns default page=1 and pageSize=50 in response', async () => {
    mockedAuth.mockResolvedValueOnce({ user: { isAdmin: true } })
    const res = await GET(req())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.page).toBe(1)
    expect(json.pageSize).toBe(50)
  })

  it('ignores invalid sortBy and returns 200', async () => {
    mockedAuth.mockResolvedValueOnce({ user: { isAdmin: true } })
    const res = await GET(req('http://localhost/api/admin/audit-log?sortBy=__evil__'))
    expect(res.status).toBe(200)
  })

  it('response contains total field', async () => {
    mockedAuth.mockResolvedValueOnce({ user: { isAdmin: true } })
    const res = await GET(req())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(typeof json.total).toBe('number')
  })
})
