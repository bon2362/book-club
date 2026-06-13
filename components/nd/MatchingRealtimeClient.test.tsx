import { render, waitFor } from '@testing-library/react'
import MatchingRealtimeClient from './MatchingRealtimeClient'

describe('MatchingRealtimeClient (polling)', () => {
  let fetchMock: jest.Mock

  beforeEach(() => {
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    jest.restoreAllMocks()
    setTabVisibility('visible')
  })

  function setTabVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state,
    })
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => state === 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  function respondVersion(version: number) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version, status: 'active' }),
    })
  }

  it('does not fire onStateChange on the first poll (baseline)', async () => {
    respondVersion(1)
    const onChange = jest.fn()
    render(<MatchingRealtimeClient sessionId="s1" onStateChange={onChange} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('fires onStateChange when the version increases', async () => {
    // First poll returns v1 (baseline), second poll returns v2 (changed)
    respondVersion(1)
    respondVersion(2)

    const onChange = jest.fn()

    // Use a short interval so we don't need fake timers
    render(
      <MatchingRealtimeClient sessionId="s1" onStateChange={onChange} pollIntervalMs={50} />
    )

    // Wait for first poll (baseline, no callback)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(onChange).not.toHaveBeenCalled()

    // Wait for second poll (version changed → callback fires)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
  })

  it('does not poll while the tab is hidden', async () => {
    setTabVisibility('hidden')
    respondVersion(1)
    render(<MatchingRealtimeClient sessionId="s1" onStateChange={jest.fn()} pollIntervalMs={20} />)

    // Дать таймеру шанс сработать, если бы он шёл.
    await new Promise((r) => setTimeout(r, 60))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does an immediate catch-up poll when the tab becomes visible', async () => {
    setTabVisibility('hidden')
    respondVersion(1)
    render(<MatchingRealtimeClient sessionId="s1" onStateChange={jest.fn()} pollIntervalMs={5_000} />)
    await new Promise((r) => setTimeout(r, 30))
    expect(fetchMock).not.toHaveBeenCalled()

    // Возврат на вкладку → немедленный poll, не дожидаясь интервала.
    setTabVisibility('visible')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })
})
