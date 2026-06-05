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
  })

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
})
