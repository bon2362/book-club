/**
 * @jest-environment node
 */
import { DELETE } from './route'
import * as authModule from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }))
const deleteMock = jest.fn()
jest.mock('@/lib/intro', () => ({
  deleteSection: (id: string) => deleteMock(id),
}))
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({}),
}))

const mockAuth = authModule.auth as jest.Mock

function req() { return new Request('http://localhost/api/admin/intro/x', { method: 'DELETE' }) }

describe('DELETE /api/admin/intro/[id]', () => {
  beforeEach(() => deleteMock.mockReset())

  it('returns 403 for non-admin', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await DELETE(req(), { params: { id: 'x' } })
    expect(res.status).toBe(403)
  })

  it('returns 404 when section not found', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    deleteMock.mockResolvedValue({ ok: false, reason: 'not_found' })
    const res = await DELETE(req(), { params: { id: 'missing' } })
    expect(res.status).toBe(404)
  })

  it('returns 400 when trying to delete header', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    deleteMock.mockResolvedValue({ ok: false, reason: 'header_protected' })
    const res = await DELETE(req(), { params: { id: 'header' } })
    expect(res.status).toBe(400)
  })

  it('returns 200 on success', async () => {
    mockAuth.mockResolvedValue({ user: { isAdmin: true } })
    deleteMock.mockResolvedValue({ ok: true })
    const res = await DELETE(req(), { params: { id: 'sec' } })
    expect(res.status).toBe(200)
  })
})
