/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET, PATCH } from './route'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { CalendarStateError, fetchCalendarPublicState } from '@/lib/calendar/public-state'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/calendar/public-state', () => ({
  CalendarStateError: class CalendarStateError extends Error {
    constructor(public readonly code: string) {
      super(code)
    }
  },
  fetchCalendarPublicState: jest.fn(),
  isMissingCalendarSchemaError: (error: unknown) => (error as { code?: string })?.code === '42P01',
  migrationRequiredState: (slug: string) => ({ slug, migrationRequired: true }),
}))
jest.mock('@/lib/audit/with-audit-context', () => ({ withAuditContext: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: {} }))

const mockAuth = auth as jest.Mock
const mockFetchCalendarPublicState = fetchCalendarPublicState as jest.MockedFunction<typeof fetchCalendarPublicState>
const mockWithAuditContext = withAuditContext as jest.MockedFunction<typeof withAuditContext>

function request(url: string, body?: unknown): NextRequest {
  return new NextRequest(url, body === undefined ? undefined : {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

function userSession(isAdmin = false) {
  return {
    user: {
      id: 'user-1',
      name: 'Reader',
      contactEmail: 'reader@example.test',
      isAdmin,
    },
  }
}

describe('/api/calendar/[slug]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns public calendar state for anonymous viewers', async () => {
    mockAuth.mockResolvedValue(null)
    mockFetchCalendarPublicState.mockResolvedValue({
      slug: 'book-circle-1',
      migrationRequired: false,
    } as Awaited<ReturnType<typeof fetchCalendarPublicState>>)

    const res = await GET(request('http://localhost/api/calendar/book-circle-1'), { params: { slug: 'book-circle-1' } })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: 'book-circle-1', migrationRequired: false })
    expect(mockFetchCalendarPublicState).toHaveBeenCalledWith({
      slug: 'book-circle-1',
      viewerUserId: null,
      requestedUserId: null,
      isAdmin: false,
    })
  })

  it('turns missing calendar tables into a migration-required placeholder', async () => {
    mockAuth.mockResolvedValue(null)
    mockFetchCalendarPublicState.mockRejectedValue({ code: '42P01' })

    const res = await GET(request('http://localhost/api/calendar/book-circle-1'), { params: { slug: 'book-circle-1' } })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: 'book-circle-1', migrationRequired: true })
  })

  it('returns 404 when the schedule slug is unknown', async () => {
    mockAuth.mockResolvedValue(null)
    mockFetchCalendarPublicState.mockRejectedValue(new CalendarStateError('schedule_not_found'))

    const res = await GET(request('http://localhost/api/calendar/missing'), { params: { slug: 'missing' } })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'schedule_not_found' })
  })

  it('rejects schedule updates from anonymous users', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await PATCH(request('http://localhost/api/calendar/book-circle-1', { durationMinutes: 60 }), { params: { slug: 'book-circle-1' } })

    expect(res.status).toBe(401)
  })

  it('lets a circle member update meeting duration', async () => {
    mockAuth.mockResolvedValue(userSession(false))
    mockFetchCalendarPublicState.mockResolvedValue({
      position: 1,
      viewer: { canEdit: true },
    } as Awaited<ReturnType<typeof fetchCalendarPublicState>>)
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

    const res = await PATCH(request('http://localhost/api/calendar/book-circle-1', { durationMinutes: 90 }), { params: { slug: 'book-circle-1' } })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, slug: 'book-circle-1' })
    expect(mockWithAuditContext).toHaveBeenCalled()
  })

  it('keeps custom slug changes admin-only', async () => {
    mockAuth.mockResolvedValue(userSession(false))

    const res = await PATCH(request('http://localhost/api/calendar/book-circle-1', { durationMinutes: 60, slug: 'custom' }), { params: { slug: 'book-circle-1' } })

    expect(res.status).toBe(403)
  })
})
