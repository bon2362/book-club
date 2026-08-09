/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { PATCH } from './route'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/audit/with-audit-context', () => ({ withAuditContext: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: {} }))

const mockAuth = auth as jest.Mock
const mockWithAuditContext = withAuditContext as jest.MockedFunction<typeof withAuditContext>

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/profile/timezone', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

describe('/api/profile/timezone', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('requires authentication', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await PATCH(request({ timezone: 'Europe/Belgrade', confirmed: true }))

    expect(res.status).toBe(401)
  })

  it('rejects invalid timezones', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', name: 'Reader', contactEmail: 'reader@example.test' },
    })

    const res = await PATCH(request({ timezone: 'Not/AZone', confirmed: true }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_timezone' })
  })

  it('stores confirmed timezone through audit context', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', name: 'Reader', contactEmail: 'reader@example.test' },
    })
    mockWithAuditContext.mockImplementation(async (_context, callback) => {
      const tx = {
        update: jest.fn(() => ({
          set: jest.fn(() => ({
            where: jest.fn(),
          })),
        })),
      }
      await callback(tx as never)
    })

    const res = await PATCH(request({ timezone: 'Europe/Belgrade', confirmed: true }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, timezone: 'Europe/Belgrade', confirmed: true })
    expect(mockWithAuditContext).toHaveBeenCalled()
  })
})
