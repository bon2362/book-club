/**
 * @jest-environment node
 */
import { GET } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))
jest.mock('@/lib/db/schema', () => ({ notificationQueue: {} }))

const mockAuth = authModule.auth as jest.Mock

function makeSelectMock(rows: { createdAt: Date }[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(rows),
  }
}

const ago = (ms: number) => new Date(Date.now() - ms)
const MIN = 60_000
const HOUR = 60 * MIN

describe('GET /api/admin/digest-status', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('возвращает 403 без isAdmin', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: false } })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('возвращает status:empty при пустой очереди', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    ;(db.select as jest.Mock).mockReturnValue(makeSelectMock([]))
    const res = await GET()
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.status).toBe('empty')
  })

  it('возвращает status:ready если все записи старше 30 мин', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    ;(db.select as jest.Mock).mockReturnValue(makeSelectMock([
      { createdAt: ago(35 * MIN) },
      { createdAt: ago(40 * MIN) },
    ]))
    const res = await GET()
    const data = await res.json()
    expect(data.status).toBe('ready')
    expect(data.count).toBe(2)
  })

  it('возвращает status:cooling если последняя запись < 30 мин назад', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    ;(db.select as jest.Mock).mockReturnValue(makeSelectMock([
      { createdAt: ago(10 * MIN) },
    ]))
    const res = await GET()
    const data = await res.json()
    expect(data.status).toBe('cooling')
    expect(data.count).toBe(1)
    expect(typeof data.sendAt).toBe('string')
    // sendAt should be ~20 min from now (10min ago + 30min window)
    const sendAt = new Date(data.sendAt).getTime()
    expect(sendAt).toBeGreaterThan(Date.now() + 15 * MIN)
    expect(sendAt).toBeLessThan(Date.now() + 25 * MIN)
  })

  it('возвращает status:ready при forced flush (старейшая запись > 2 ч)', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    ;(db.select as jest.Mock).mockReturnValue(makeSelectMock([
      { createdAt: ago(3 * HOUR) },   // oldest > 2h → forced flush
      { createdAt: ago(10 * MIN) },   // latest still cooling
    ]))
    const res = await GET()
    const data = await res.json()
    expect(data.status).toBe('ready')
    expect(data.count).toBe(2)
  })
})
