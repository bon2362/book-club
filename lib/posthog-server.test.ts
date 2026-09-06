/**
 * @jest-environment node
 */
import { deletePostHogPerson, captureServerEvent, setPersonProperties, __resetForTesting } from './posthog-server'

const mockCapture = jest.fn()
const mockIdentify = jest.fn()
const mockFlush = jest.fn().mockResolvedValue(undefined)

jest.mock('posthog-node', () => ({
  PostHog: jest.fn().mockImplementation(() => ({
    capture: mockCapture,
    identify: mockIdentify,
    flush: mockFlush,
  })),
}))

const ORIGINAL_ENV = process.env

beforeEach(() => {
  jest.clearAllMocks()
  __resetForTesting()
  process.env = {
    ...ORIGINAL_ENV,
    POSTHOG_PERSONAL_API_KEY: 'phx_test_key',
    POSTHOG_PROJECT_ID: '181956',
    NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.posthog.com',
    NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: 'phc_test_token',
  }
  delete process.env.NEXTAUTH_TEST_MODE
  delete process.env.NEXT_PUBLIC_DISABLE_ANALYTICS
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

describe('captureServerEvent', () => {
  it('не отправляет событие в тест-режиме (NEXTAUTH_TEST_MODE=true)', async () => {
    process.env.NEXTAUTH_TEST_MODE = 'true'
    await captureServerEvent('user-1', 'auth_succeeded', { provider: 'telegram' })
    expect(mockCapture).not.toHaveBeenCalled()
    expect(mockFlush).not.toHaveBeenCalled()
  })

  it('не отправляет событие если аналитика отключена (NEXT_PUBLIC_DISABLE_ANALYTICS=true)', async () => {
    process.env.NEXT_PUBLIC_DISABLE_ANALYTICS = 'true'
    await captureServerEvent('user-1', 'auth_succeeded')
    expect(mockCapture).not.toHaveBeenCalled()
    expect(mockFlush).not.toHaveBeenCalled()
  })

  it('не отправляет событие без токена проекта', async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
    await captureServerEvent('user-1', 'auth_succeeded')
    expect(mockCapture).not.toHaveBeenCalled()
    expect(mockFlush).not.toHaveBeenCalled()
  })

  it('отправляет событие с правильным distinctId и свойствами, дожидается flush', async () => {
    await captureServerEvent('user-1', 'auth_succeeded', { provider: 'telegram', is_new_user: true })

    expect(mockCapture).toHaveBeenCalledTimes(1)
    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: 'user-1',
      event: 'auth_succeeded',
      properties: { provider: 'telegram', is_new_user: true },
    })
    expect(mockFlush).toHaveBeenCalledTimes(1)
  })

  it('не пробрасывает исключение если клиент/сеть упали — best-effort', async () => {
    mockCapture.mockImplementation(() => {
      throw new Error('capture failed')
    })
    await expect(captureServerEvent('user-1', 'auth_succeeded')).resolves.toBeUndefined()
  })

  it('не пробрасывает исключение если flush упал — best-effort', async () => {
    mockFlush.mockRejectedValueOnce(new Error('network down'))
    await expect(captureServerEvent('user-1', 'auth_succeeded')).resolves.toBeUndefined()
  })
})

describe('setPersonProperties', () => {
  it('не отправляет свойства в тест-режиме (NEXTAUTH_TEST_MODE=true)', async () => {
    process.env.NEXTAUTH_TEST_MODE = 'true'
    await setPersonProperties('user-1', { name: 'Ада' })
    expect(mockIdentify).not.toHaveBeenCalled()
    expect(mockFlush).not.toHaveBeenCalled()
  })

  it('не отправляет свойства если аналитика отключена', async () => {
    process.env.NEXT_PUBLIC_DISABLE_ANALYTICS = 'true'
    await setPersonProperties('user-1', { name: 'Ада' })
    expect(mockIdentify).not.toHaveBeenCalled()
  })

  it('не отправляет свойства без токена проекта', async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
    await setPersonProperties('user-1', { name: 'Ада' })
    expect(mockIdentify).not.toHaveBeenCalled()
  })

  it('устанавливает свойства персоны с правильным distinctId, дожидается flush', async () => {
    await setPersonProperties('user-1', { name: 'Ада', telegram_username: 'ada_lovelace' })

    expect(mockIdentify).toHaveBeenCalledTimes(1)
    expect(mockIdentify).toHaveBeenCalledWith({
      distinctId: 'user-1',
      properties: { name: 'Ада', telegram_username: 'ada_lovelace' },
    })
    expect(mockFlush).toHaveBeenCalledTimes(1)
  })

  it('не пробрасывает исключение при ошибке — best-effort', async () => {
    mockIdentify.mockImplementation(() => {
      throw new Error('identify failed')
    })
    await expect(setPersonProperties('user-1', { name: 'Ада' })).resolves.toBeUndefined()
  })
})
