import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MatchingBookAdminToolbar from './MatchingBookAdminToolbar'

describe('MatchingBookAdminToolbar', () => {
  beforeEach(() => {
    jest.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('initializes book mode through the admin command route', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ stateVersion: 2 }) }) as jest.Mock
    const onRefresh = jest.fn().mockResolvedValue(undefined)
    render(
      <MatchingBookAdminToolbar
        sessionId="s1"
        sessionStatus="active"
        stateVersion={1}
        initialized={false}
        onState={() => {}}
        onRefresh={onRefresh}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Включить книжный режим' }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/matching/sessions/s1/book-admin-actions',
      expect.objectContaining({ method: 'POST' }),
    ))
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      action: 'initializeBookMode', expectedStateVersion: 1,
    })
  })

  it('offers reopen for a closed initialized session', () => {
    render(
      <MatchingBookAdminToolbar
        sessionId="s1"
        sessionStatus="closed"
        stateVersion={2}
        initialized
        onState={() => {}}
        onRefresh={async () => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Открыть сессию снова' })).toBeInTheDocument()
  })

  it.each([
    ['open', 'Закрыть сессию', 'closeSession'],
    ['closed', 'Открыть сессию снова', 'reopenSession'],
  ])('sends the %s lifecycle command', async (sessionStatus, label, action) => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ stateVersion: 3 }) }) as jest.Mock
    render(
      <MatchingBookAdminToolbar
        sessionId="s1"
        sessionStatus={sessionStatus}
        stateVersion={2}
        initialized
        onState={() => {}}
        onRefresh={async () => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: label }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({ action, expectedStateVersion: 2 })
  })

  it('reconciles stale lifecycle state and asks for a retry', async () => {
    const canonical = { session: { stateVersion: 4 }, bookMode: { initializedAt: 'now', books: [] } }
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ state: canonical }) }) as jest.Mock
    const onState = jest.fn()
    render(
      <MatchingBookAdminToolbar
        sessionId="s1"
        sessionStatus="open"
        stateVersion={3}
        initialized
        onState={onState}
        onRefresh={async () => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть сессию' }))
    await waitFor(() => expect(onState).toHaveBeenCalledWith(canonical))
    expect(screen.getByText(/данные обновлены/i)).toBeInTheDocument()
  })
})
