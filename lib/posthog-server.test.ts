/**
 * @jest-environment node
 */
import { deletePostHogPerson } from './posthog-server'

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

describe('deletePostHogPerson', () => {
  it('делает DELETE-запрос с правильным URL и заголовком', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response)
    await deletePostHogPerson('user-1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://eu.posthog.com/api/projects/181956/persons/?distinct_id=user-1&delete_events=true',
    )
    expect((opts as RequestInit).method).toBe('DELETE')
    const headers = (opts as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer phx_test_key')
  })

  it('кодирует distinct_id в URL', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response)
    await deletePostHogPerson('user with spaces & symbols')
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('distinct_id=user%20with%20spaces%20%26%20symbols')
  })

  it('тихо игнорирует если env-переменные не заданы', async () => {
    delete process.env.POSTHOG_PERSONAL_API_KEY
    const fetchMock = jest.spyOn(global, 'fetch')
    await expect(deletePostHogPerson('user-1')).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('не пробрасывает исключение если fetch упал — best-effort cleanup', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
    await expect(deletePostHogPerson('user-1')).resolves.toBeUndefined()
  })
})
