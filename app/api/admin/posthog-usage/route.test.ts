/**
 * @jest-environment node
 */
import { GET } from './route'
import * as authModule from '@/lib/auth'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))

const mockAuth = authModule.auth as jest.Mock

const ORIGINAL_ENV = process.env

beforeEach(() => {
  jest.resetAllMocks()
  process.env = {
    ...ORIGINAL_ENV,
    POSTHOG_PERSONAL_API_KEY: 'phx_test_key',
    POSTHOG_PROJECT_ID: '181956',
    NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.posthog.com',
  }
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('GET /api/admin/posthog-usage', () => {
  it('возвращает 403 без сессии', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('возвращает 403 если isAdmin=false', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'u@t.ru', isAdmin: false } })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('возвращает 503 если POSTHOG_PERSONAL_API_KEY не задан', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'a@t.ru', isAdmin: true } })
    delete process.env.POSTHOG_PERSONAL_API_KEY
    const res = await GET()
    expect(res.status).toBe(503)
    const data = await res.json()
    expect(data.error).toBe('not_configured')
  })

  it('возвращает 503 если POSTHOG_PROJECT_ID не задан', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'a@t.ru', isAdmin: true } })
    delete process.env.POSTHOG_PROJECT_ID
    const res = await GET()
    expect(res.status).toBe(503)
  })

  it('возвращает события и лимит при успешном запросе к PostHog', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'a@t.ru', isAdmin: true } })
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [[42_137]] }),
    } as Response)

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.eventsThisMonth).toBe(42_137)
    expect(data.limit).toBe(1_000_000)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://eu.posthog.com/api/projects/181956/query/')
    const headers = (opts as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer phx_test_key')
    const body = JSON.parse((opts as RequestInit).body as string)
    expect(body.query.kind).toBe('HogQLQuery')
    expect(body.query.query).toMatch(/toStartOfMonth\(now\(\)\)/)
  })

  it('возвращает 502 если PostHog ответил ошибкой', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'a@t.ru', isAdmin: true } })
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid api key',
    } as Response)

    const res = await GET()
    expect(res.status).toBe(502)
    const data = await res.json()
    expect(data.error).toBe('posthog_error')
  })

  it('возвращает 502 если fetch упал', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'a@t.ru', isAdmin: true } })
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))

    const res = await GET()
    expect(res.status).toBe(502)
    const data = await res.json()
    expect(data.error).toBe('fetch_failed')
  })

  it('возвращает 0 если PostHog отдал пустой результат', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'a@t.ru', isAdmin: true } })
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    } as Response)

    const res = await GET()
    const data = await res.json()
    expect(data.eventsThisMonth).toBe(0)
  })
})
