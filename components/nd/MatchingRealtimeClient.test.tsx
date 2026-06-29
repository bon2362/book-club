import { render, waitFor, screen } from '@testing-library/react'
import MatchingRealtimeClient, { type MatchingPublicState } from './MatchingRealtimeClient'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))

describe('MatchingRealtimeClient', () => {
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

  function respondVersion(version: number, status = 'active', online: string[] = ['u1']) {
    fetchMock.mockImplementationOnce((url: string) => {
      if (url.includes('/version')) {
        return Promise.resolve({ ok: true, json: async () => ({ version, status, online }) })
      }
      return Promise.resolve({ ok: false })
    })
  }

  function makeInitialState(stateVersion = 1): MatchingPublicState {
    return {
      session: { status: 'active', stateVersion },
      viewer: { role: 'active', ref: 'r1', lockedCircleId: null },
      scenarios: [],
      lockedCircles: [],
      notices: [],
      viewerConfirmedCircleKey: null,
    }
  }

  it('renders the board container', () => {
    respondVersion(1)
    render(
      <MatchingRealtimeClient
        sessionId="s1"
        initialState={makeInitialState()}
        bookTitleById={{}}
        pollIntervalMs={50_000}
      />,
    )
    expect(screen.getByTestId('matching-realtime-client')).toBeInTheDocument()
  })

  it('does not fire a state fetch on the first poll when version is unchanged', async () => {
    respondVersion(1) // same as initialState stateVersion=1
    render(
      <MatchingRealtimeClient
        sessionId="s1"
        initialState={makeInitialState(1)}
        bookTitleById={{}}
        pollIntervalMs={50}
      />,
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    // Only version URL called, no /state call
    expect(fetchMock.mock.calls[0][0]).toContain('/version')
  })

  it('fetches full state when version changes', async () => {
    const stateResponse = {
      ok: true,
      json: async () => ({
        session: { status: 'active', stateVersion: 2 },
        viewer: { role: 'active', ref: 'r1', lockedCircleId: null },
        scenarios: [],
        lockedCircles: [],
        notices: [],
        participants: [],
      }),
    }

    // First call: /version returns v1 (baseline, no fetch)
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ version: 1, status: 'active', online: ['u1'] }) })
    // Second call: /version returns v2 (changed)
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ version: 2, status: 'active', online: ['u1'] }) })
    // Third call: /state fetch
    fetchMock.mockResolvedValueOnce(stateResponse)

    render(
      <MatchingRealtimeClient
        sessionId="s1"
        initialState={makeInitialState(1)}
        bookTitleById={{}}
        pollIntervalMs={50}
      />,
    )

    // Wait for /state fetch to be called (after version change triggers it)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/state'),
    ), { timeout: 2000 })
  })

  it('does not poll while the tab is hidden', async () => {
    setTabVisibility('hidden')
    render(
      <MatchingRealtimeClient
        sessionId="s1"
        initialState={makeInitialState()}
        bookTitleById={{}}
        pollIntervalMs={20}
      />,
    )
    await new Promise((r) => setTimeout(r, 60))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does an immediate catch-up poll when the tab becomes visible', async () => {
    setTabVisibility('hidden')
    respondVersion(1)
    render(
      <MatchingRealtimeClient
        sessionId="s1"
        initialState={makeInitialState()}
        bookTitleById={{}}
        pollIntervalMs={5_000}
      />,
    )
    await new Promise((r) => setTimeout(r, 30))
    expect(fetchMock).not.toHaveBeenCalled()

    setTabVisibility('visible')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it('stops polling once the session is frozen', async () => {
    // v1 baseline
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ version: 1, status: 'active', online: ['u1'] }) })
    // v2 frozen
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ version: 2, status: 'frozen', online: ['u1'] }) })
    // /state fetch after version change
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        session: { status: 'frozen', stateVersion: 2 },
        viewer: { role: 'active', ref: 'r1', lockedCircleId: null },
        scenarios: [],
        lockedCircles: [],
        notices: [],
        participants: [],
      }),
    })

    render(
      <MatchingRealtimeClient
        sessionId="s1"
        initialState={makeInitialState(1)}
        bookTitleById={{}}
        pollIntervalMs={20}
      />,
    )

    // Wait for baseline + frozen poll
    await waitFor(() => {
      const versionCalls = fetchMock.mock.calls.filter(([url]) => (url as string).includes('/version'))
      expect(versionCalls.length).toBe(2)
    })

    // Give it time to NOT poll more
    await new Promise((r) => setTimeout(r, 80))
    const versionCallsAfter = fetchMock.mock.calls.filter(([url]) => (url as string).includes('/version'))
    expect(versionCallsAfter.length).toBe(2)
  })

  it('renders notices when state has them', () => {
    const stateWithNotice = makeInitialState()
    stateWithNotice.notices = [
      { id: 'n1', kind: 'circle_locked', payload: {}, createdAt: '2026-06-29T10:00:00.000Z' },
    ]
    respondVersion(1)
    render(
      <MatchingRealtimeClient
        sessionId="s1"
        initialState={stateWithNotice}
        bookTitleById={{}}
        pollIntervalMs={50_000}
      />,
    )
    expect(screen.getByTestId('matching-notices')).toBeInTheDocument()
  })

  it('renders locked circles when state has them', () => {
    const stateWithLock = makeInitialState()
    stateWithLock.lockedCircles = [
      {
        id: 'lc1',
        circleKey: 'key1',
        bookId: 'b1',
        lockedAt: '2026-06-29T10:00:00.000Z',
        members: [{ ref: 'r1', displayName: 'Анна' }],
      },
    ]
    respondVersion(1)
    render(
      <MatchingRealtimeClient
        sessionId="s1"
        initialState={stateWithLock}
        bookTitleById={{ b1: 'Первая книга' }}
        pollIntervalMs={50_000}
      />,
    )
    expect(screen.getByTestId('matching-locked-circles')).toBeInTheDocument()
    expect(screen.getByText('Первая книга')).toBeInTheDocument()
  })
})
