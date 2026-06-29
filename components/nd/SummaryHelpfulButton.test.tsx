import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SummaryHelpfulButton from './SummaryHelpfulButton'

function response(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  global.fetch = jest.fn()
})

describe('SummaryHelpfulButton', () => {
  it('shows the public count immediately but stays busy until guest state loads', async () => {
    const hydration = deferred<Response>()
    ;(global.fetch as jest.Mock).mockReturnValueOnce(hydration.promise)

    render(<SummaryHelpfulButton summaryId="s1" initialHelpfulCount={0} hasSession={false} />)

    const button = screen.getByRole('button', { name: 'Полезно' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).not.toHaveTextContent('· 0')
    expect(global.fetch).toHaveBeenCalledWith('/api/summaries/s1/helpful', expect.objectContaining({ signal: expect.any(AbortSignal) }))

    await act(async () => hydration.resolve(response({ count: 0, reacted: false })))
    await waitFor(() => expect(button).toBeEnabled())
    expect(button).toHaveAttribute('aria-busy', 'false')
  })

  it('uses reconcile for an account and falls back to GET when reconcile fails', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(response({ error: 'failed' }, false))
      .mockResolvedValueOnce(response({ count: 3, reacted: true }))

    render(<SummaryHelpfulButton summaryId="s1" initialHelpfulCount={2} hasSession />)

    await screen.findByRole('button', { name: 'Полезно · 3' })
    expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/summaries/helpful/reconcile', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ summaryId: 's1' }),
    }))
    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/summaries/s1/helpful', expect.any(Object))
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('updates optimistically, blocks duplicate clicks, then accepts authoritative server state', async () => {
    const mutation = deferred<Response>()
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(response({ count: 0, reacted: false }))
      .mockReturnValueOnce(mutation.promise)

    render(<SummaryHelpfulButton summaryId="s1" initialHelpfulCount={0} hasSession={false} />)
    const button = await screen.findByRole('button', { name: 'Полезно' })
    await waitFor(() => expect(button).toBeEnabled())

    fireEvent.click(button)
    expect(button).toHaveTextContent('Полезно · 1')
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(global.fetch).toHaveBeenCalledTimes(2)

    await act(async () => mutation.resolve(response({ count: 2, reacted: true })))
    await waitFor(() => expect(button).toHaveTextContent('Полезно · 2'))
    expect(button).toBeEnabled()
    expect(global.fetch).toHaveBeenLastCalledWith('/api/summaries/s1/helpful', expect.objectContaining({ method: 'PUT' }))
  })

  it('rolls back optimistic state and exposes a short accessible error', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(response({ count: 2, reacted: false }))
      .mockResolvedValueOnce(response({ error: 'failed' }, false))

    render(<SummaryHelpfulButton summaryId="s1" initialHelpfulCount={2} hasSession={false} />)
    const button = await screen.findByRole('button', { name: 'Полезно · 2' })
    await waitFor(() => expect(button).toBeEnabled())

    fireEvent.click(button)
    expect(button).toHaveTextContent('Полезно · 3')
    await screen.findByRole('alert')
    expect(button).toHaveTextContent('Полезно · 2')
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('alert')).toHaveTextContent('Не получилось. Попробуйте ещё раз.')
  })

  it('optimistically removes an active reaction without displaying zero', async () => {
    const mutation = deferred<Response>()
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(response({ count: 1, reacted: true }))
      .mockReturnValueOnce(mutation.promise)

    render(<SummaryHelpfulButton summaryId="s1" initialHelpfulCount={1} hasSession={false} />)
    const button = await screen.findByRole('button', { name: 'Полезно · 1' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)

    expect(button).toHaveTextContent('Полезно')
    expect(button).not.toHaveTextContent('· 0')
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(global.fetch).toHaveBeenLastCalledWith('/api/summaries/s1/helpful', expect.objectContaining({ method: 'DELETE' }))

    await act(async () => mutation.resolve(response({ count: 0, reacted: false })))
  })
})
