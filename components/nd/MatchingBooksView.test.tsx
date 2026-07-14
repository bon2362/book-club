import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MatchingBooksView from './MatchingBooksView'
import type { MatchingBookModeState } from './matching-book-types'

const mode: MatchingBookModeState = {
  initializedAt: '2026-07-13T10:00:00.000Z',
  viewerAssignmentBookId: null,
  books: [{
    bookId: 'b1', title: 'Первая', author: 'Автор', coverUrl: null,
    intersectionCount: 1, formedAt: null, currentViability: 'unformed', viewerStatus: 'interest',
    participants: [{ ref: 'viewer', displayName: 'Я', status: 'interest' }], circles: [], unplacedParticipantRefs: [],
    allowedActions: { conditional: true, hard: true, cancelHard: false },
  }],
}

const props = {
  sessionId: 's1', stateVersion: 3, sessionStatus: 'open', viewerRef: 'viewer',
  bookMode: mode, booksById: {}, isAdmin: false, onState: jest.fn(), onRefresh: jest.fn(),
}

describe('MatchingBooksView commands', () => {
  beforeEach(() => {
    props.onState.mockClear()
    props.onRefresh.mockReset()
  })

  it('sends a versioned hard command', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ changed: true }) }) as jest.Mock
    props.onRefresh.mockResolvedValue(undefined)
    render(<MatchingBooksView {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Записать' }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      action: 'setHard', bookId: 'b1', expectedStateVersion: 3,
    })
    expect(props.onRefresh).toHaveBeenCalled()
  })

  it('blocks conflicting board controls globally and restores focus after completion', async () => {
    let resolveResponse!: (value: unknown) => void
    global.fetch = jest.fn().mockReturnValue(new Promise((resolve) => { resolveResponse = resolve })) as jest.Mock
    props.onRefresh.mockResolvedValue(undefined)
    const second = { ...mode.books[0], bookId: 'b2', title: 'Вторая' }
    render(<MatchingBooksView {...props} bookMode={{ ...mode, books: [mode.books[0], second] }} />)
    const firstAction = screen.getAllByRole('button', { name: 'Записать' })[0]
    const secondAction = screen.getAllByRole('button', { name: 'Записать' })[1]
    firstAction.focus()
    fireEvent.click(firstAction)
    expect(screen.getByRole('button', { name: 'Записываем…' })).toBeDisabled()
    expect(secondAction).toBeDisabled()
    expect(screen.getByTestId('matching-books-view')).toHaveAttribute('aria-busy', 'true')
    resolveResponse({ ok: true, json: async () => ({ changed: true }) })
    await waitFor(() => expect(firstAction).toHaveFocus())
  })

  it('never exposes participant CTAs in admin mode', () => {
    render(<MatchingBooksView {...props} isAdmin bookMode={{ ...mode, adminParticipants: [] }} />)
    expect(screen.queryByRole('button', { name: 'Записать' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Готов читать' })).not.toBeInTheDocument()
    expect(screen.queryByText('Административный режим — выбор участника недоступен')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Управлять составом' })).toBeInTheDocument()
  })

  it('marks a closed participant board as read-only', () => {
    render(<MatchingBooksView {...props} sessionStatus="closed" />)
    expect(screen.getByTestId('matching-books-readonly')).toHaveTextContent('только для просмотра')
    expect(screen.queryByRole('button', { name: 'Записать' })).not.toBeInTheDocument()
  })

  it('reconciles a stale command and gives a recoverable message', async () => {
    const canonical = { session: { stateVersion: 4 }, bookMode: mode }
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ state: canonical }) }) as jest.Mock
    render(<MatchingBooksView {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Записать' }))
    await waitFor(() => expect(props.onState).toHaveBeenCalledWith(canonical))
    expect(screen.getByTestId('matching-books-message')).toHaveTextContent('Данные обновлены')
  })

  it('preserves backend book order', () => {
    const second = { ...mode.books[0], bookId: 'b2', title: 'Вторая', intersectionCount: 99 }
    render(<MatchingBooksView {...props} bookMode={{ ...mode, books: [mode.books[0], second] }} />)
    expect(screen.getAllByTestId(/matching-book-card-/).map((card) => card.textContent)).toEqual([
      expect.stringContaining('Первая'), expect.stringContaining('Вторая'),
    ])
  })
})
