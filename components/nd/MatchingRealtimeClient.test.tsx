import { act, fireEvent, render, waitFor, screen } from '@testing-library/react'
import MatchingRealtimeClient, { type MatchingPublicState } from './MatchingRealtimeClient'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

describe('MatchingRealtimeClient', () => {
  let fetchMock: jest.Mock
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    setTabVisibility('visible')
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
    refresh.mockClear()
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
    if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia })
    else Reflect.deleteProperty(window, 'matchMedia')
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

  function respondVersion(version: number, status = 'active', online?: string[]) {
    fetchMock.mockImplementationOnce((url: string) => {
      if (url.includes('/version')) {
        return Promise.resolve({ ok: true, json: async () => ({ version, status, ...(online ? { online } : {}) }) })
      }
      return Promise.resolve({ ok: false })
    })
  }

  function makeInitialState(stateVersion = 1): MatchingPublicState {
    return {
      session: { name: 'Июль', status: 'active', stateVersion, minGroupSize: 3, maxGroupSize: 4, deadlineAt: null },
      viewer: { role: 'active', ref: 'r1', lockedCircleKey: null },
      participants: [{ ref: 'r1', displayName: 'Анна', online: false }],
      scenarios: [],
      lockedCircles: [],
      notices: [],
      viewerConfirmedCircleKey: null,
    }
  }

  it('applies heartbeat online refs to rendered participant state', async () => {
    respondVersion(1, 'active', ['r1'])
    render(<MatchingRealtimeClient sessionId="s1" initialState={makeInitialState()} bookTitleById={{}} pollIntervalMs={50_000} />)
    await waitFor(() => expect(screen.getByLabelText('Анна — онлайн')).toBeInTheDocument())
  })

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

  it('opens initialized sessions on the book tab and keeps scenarios read-only', () => {
    const state = makeInitialState()
    state.bookMode = {
      initializedAt: '2026-07-13T10:00:00.000Z',
      viewerAssignmentBookId: null,
      books: [{
        bookId: 'b1', title: 'Книга режима', author: 'Автор', coverUrl: null,
        intersectionCount: 0, formedAt: null, currentViability: 'unformed', viewerStatus: 'interest',
        participants: [], circles: [], unplacedParticipantRefs: [],
        allowedActions: { conditional: true, hard: true, cancelHard: false },
      }],
    }
    respondVersion(1)
    render(<MatchingRealtimeClient sessionId="s1" initialState={state} bookTitleById={{}} pollIntervalMs={50_000} />)
    expect(screen.getByRole('tab', { name: 'Книги' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('matching-books-view')).toHaveTextContent('Книга режима')
    expect(screen.queryByTestId('matching-scenarios-empty')).not.toBeInTheDocument()
  })

  it('returns an initialized session to books when the viewport enters mobile', () => {
    let mobile = false
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        get matches() { return mobile },
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
        dispatchEvent: () => true,
      })),
    })
    const state = makeInitialState()
    state.bookMode = {
      initializedAt: '2026-07-13T10:00:00.000Z',
      viewerAssignmentBookId: null,
      books: [{
        bookId: 'b1', title: 'Мобильная книга', author: 'Автор', coverUrl: null,
        intersectionCount: 0, formedAt: null, currentViability: 'unformed', viewerStatus: 'interest',
        participants: [], circles: [], unplacedParticipantRefs: [],
        allowedActions: { conditional: true, hard: true, cancelHard: false },
      }],
    }
    respondVersion(1)
    render(<MatchingRealtimeClient sessionId="s1" initialState={state} bookTitleById={{}} pollIntervalMs={50_000} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Сценарии' }))
    expect(screen.getByRole('tab', { name: 'Сценарии' })).toHaveAttribute('aria-selected', 'true')

    mobile = true
    act(() => listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent)))

    expect(screen.getByRole('tab', { name: 'Книги' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('matching-books-view')).toHaveTextContent('Мобильная книга')
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

  it('updates impersonated full state and refreshes server props when version changes', async () => {
    jest.useFakeTimers()
    const stateResponse = {
      ok: true,
      json: async () => ({
        session: { status: 'active', stateVersion: 2 },
        viewer: { role: 'active', ref: 'r1', lockedCircleKey: null },
        scenarios: [],
        lockedCircles: [],
        notices: [],
        participants: [{ ref: 'r1', displayName: 'Анна новая', online: true }],
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
        impersonatedUserId="u2"
        pollIntervalMs={50}
      />,
    )

    await act(async () => { await jest.advanceTimersByTimeAsync(50) })
    expect(fetchMock).toHaveBeenCalledWith('/api/matching/state?session=s1&as=u2')
    expect(screen.getByText('Анна новая')).toBeInTheDocument()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('resets viewer-specific state when the impersonated participant changes', () => {
    setTabVisibility('hidden')
    const first = makeInitialState(1)
    first.participants[0].displayName = 'Участник А'
    const second = makeInitialState(4)
    second.participants[0].displayName = 'Участник Б'
    const { rerender } = render(
      <MatchingRealtimeClient
        sessionId="s1"
        initialState={first}
        bookTitleById={{}}
        impersonatedUserId="user-a"
        pollIntervalMs={50_000}
      />,
    )
    expect(screen.getByText('Участник А')).toBeInTheDocument()

    rerender(
      <MatchingRealtimeClient
        sessionId="s1"
        initialState={second}
        bookTitleById={{}}
        impersonatedUserId="user-b"
        pollIntervalMs={50_000}
      />,
    )

    expect(screen.getByText('Участник Б')).toBeInTheDocument()
    expect(screen.queryByText('Участник А')).not.toBeInTheDocument()
  })

  it('retries the same changed version when personalized state refresh fails', async () => {
    jest.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ version: 1, status: 'active' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ version: 2, status: 'active' }) })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ version: 2, status: 'active' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: { status: 'active', stateVersion: 2 },
          viewer: { role: 'active', ref: 'r1', lockedCircleKey: null },
          scenarios: [], lockedCircles: [], notices: [],
          participants: [{ ref: 'r1', displayName: 'После retry', online: false }],
        }),
      })

    render(
      <MatchingRealtimeClient
        sessionId="s1"
        initialState={makeInitialState(1)}
        bookTitleById={{}}
        impersonatedUserId="user-a"
        pollIntervalMs={50}
      />,
    )

    await act(async () => { await jest.advanceTimersByTimeAsync(50) })
    expect(refresh).not.toHaveBeenCalled()
    await act(async () => { await jest.advanceTimersByTimeAsync(50) })

    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/state'))).toHaveLength(2)
    expect(screen.getByText('После retry')).toBeInTheDocument()
    expect(refresh).toHaveBeenCalledTimes(1)
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

  it('refreshes server props before stopping once the session is frozen', async () => {
    jest.useFakeTimers()
    // v1 baseline
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ version: 1, status: 'active', online: ['u1'] }) })
    // v2 frozen
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ version: 2, status: 'frozen', online: ['u1'] }) })
    // /state fetch after version change
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        session: { status: 'frozen', stateVersion: 2 },
        viewer: { role: 'active', ref: 'r1', lockedCircleKey: null },
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

    await act(async () => { await jest.advanceTimersByTimeAsync(20) })
    const versionCalls = fetchMock.mock.calls.filter(([url]) => (url as string).includes('/version'))
    expect(versionCalls.length).toBe(2)
    expect(refresh).toHaveBeenCalledTimes(1)

    await act(async () => { await jest.advanceTimersByTimeAsync(80) })
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
