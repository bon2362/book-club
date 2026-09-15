/**
 * @jest-environment node
 */
jest.mock('@/lib/widget-updates', () => ({
  ...jest.requireActual('@/lib/widget-updates'),
  getWidgetUpdates: jest.fn(),
}))
jest.mock('@/lib/db', () => ({ db: {} }))

import { GET } from './route'
import { getWidgetUpdates } from '@/lib/widget-updates'

const mockGetWidgetUpdates = getWidgetUpdates as jest.Mock

function request(headers: Record<string, string> = {}, query = '') {
  return new Request(`http://localhost/api/widget/updates${query}`, { headers })
}

describe('GET /api/widget/updates', () => {
  const originalToken = process.env.WIDGET_TOKEN

  beforeEach(() => {
    process.env.WIDGET_TOKEN = 'secret-token'
    mockGetWidgetUpdates.mockReset()
    mockGetWidgetUpdates.mockResolvedValue({ users: { count: 1 } })
  })

  afterAll(() => {
    process.env.WIDGET_TOKEN = originalToken
  })

  it('401, если WIDGET_TOKEN не настроен', async () => {
    delete process.env.WIDGET_TOKEN
    const res = await GET(request({ Authorization: 'Bearer secret-token' }))
    expect(res.status).toBe(401)
    expect(mockGetWidgetUpdates).not.toHaveBeenCalled()
  })

  it('401 без заголовка и с чужим токеном', async () => {
    expect((await GET(request())).status).toBe(401)
    expect((await GET(request({ Authorization: 'Bearer wrong' }))).status).toBe(401)
    expect((await GET(request({ Authorization: 'secret-token' }))).status).toBe(401)
    expect(mockGetWidgetUpdates).not.toHaveBeenCalled()
  })

  it('200 и сводка за переданное since, без кэша', async () => {
    const res = await GET(request({ Authorization: 'Bearer secret-token' }, '?since=2026-09-14T08:00:00Z'))

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ users: { count: 1 } })
    const [since] = mockGetWidgetUpdates.mock.calls[0]
    expect((since as Date).toISOString()).toBe('2026-09-14T08:00:00.000Z')
  })
})
