import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MatchingBooksView from './MatchingBooksView'
import type { MatchingBookModeState } from './matching-book-types'

const mode: MatchingBookModeState = {
  initializedAt: '2026-07-13T10:00:00.000Z',
  viewerAssignmentBookId: null,
  books: [{
    bookId: 'b1', title: 'Первая', author: 'Автор', coverUrl: null,
    intersectionCount: 1, formedAt: null, currentViability: 'unformed', viewerStatus: 'interest',
    participants: [{ ref: 'viewer', displayName: 'Я', status: 'interest', rank: 1 }], circles: [], unplacedParticipantRefs: [],
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

  it('uses the approved participant heading and instructions', () => {
    render(<MatchingBooksView {...props} />)
    expect(screen.getByRole('heading', { name: 'Совпадения по вашим книгам' })).toBeInTheDocument()
    expect(screen.getByText(/Выберите одну книгу, которую будете читать/)).toHaveTextContent(
      'Нажмите "Готов:а читать", чтобы выбрать несколько книг',
    )
  })

  it('sends a versioned hard command', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ changed: true }) }) as jest.Mock
    props.onRefresh.mockResolvedValue(undefined)
    render(<MatchingBooksView {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Записаться' }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      action: 'setHard', bookId: 'b1', expectedStateVersion: 3,
    })
    expect(props.onRefresh).toHaveBeenCalled()
  })

  it('targets the impersonated participant in a book command', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ changed: true }) }) as jest.Mock
    props.onRefresh.mockResolvedValue(undefined)
    render(<MatchingBooksView {...props} mutationUserId="user 2" />)
    fireEvent.click(screen.getByRole('button', { name: 'Записаться' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/matching/sessions/s1/book-actions?as=user%202',
      expect.any(Object),
    ))
  })

  it('blocks conflicting board controls globally and restores focus after completion', async () => {
    let resolveResponse!: (value: unknown) => void
    global.fetch = jest.fn().mockReturnValue(new Promise((resolve) => { resolveResponse = resolve })) as jest.Mock
    props.onRefresh.mockResolvedValue(undefined)
    const second = { ...mode.books[0], bookId: 'b2', title: 'Вторая' }
    render(<MatchingBooksView {...props} bookMode={{ ...mode, books: [mode.books[0], second] }} />)
    const firstAction = screen.getAllByRole('button', { name: 'Записаться' })[0]
    const secondAction = screen.getAllByRole('button', { name: 'Записаться' })[1]
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
    expect(screen.queryByRole('button', { name: 'Записаться' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Готов:а читать' })).not.toBeInTheDocument()
    expect(screen.queryByText('Административный режим — выбор участника недоступен')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Управлять составом' })).toBeInTheDocument()
  })

  it('marks a closed participant board as read-only', () => {
    render(<MatchingBooksView {...props} sessionStatus="closed" />)
    expect(screen.getByTestId('matching-books-readonly')).toHaveTextContent('только для просмотра')
    expect(screen.queryByRole('button', { name: 'Записаться' })).not.toBeInTheDocument()
  })

  it('reconciles a stale command and gives a recoverable message', async () => {
    const canonical = { session: { stateVersion: 4 }, bookMode: mode }
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ state: canonical }) }) as jest.Mock
    render(<MatchingBooksView {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Записаться' }))
    await waitFor(() => expect(props.onState).toHaveBeenCalledWith(canonical))
    expect(screen.getByTestId('matching-books-message')).toHaveTextContent('Данные обновлены')
  })

  it('translates a locked participant error into product language', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'participant_locked' }),
    }) as jest.Mock
    render(<MatchingBooksView {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Записаться' }))

    await waitFor(() => expect(screen.getByTestId('matching-books-message')).toHaveTextContent(
      'Вы уже назначены в сформированный круг',
    ))
    expect(screen.queryByText('participant_locked')).not.toBeInTheDocument()
  })

  it('preserves backend book order', () => {
    const second = { ...mode.books[0], bookId: 'b2', title: 'Вторая', intersectionCount: 99 }
    render(<MatchingBooksView {...props} bookMode={{ ...mode, books: [mode.books[0], second] }} />)
    expect(screen.getAllByTestId(/matching-book-card-/).map((card) => card.textContent)).toEqual([
      expect.stringContaining('Первая'), expect.stringContaining('Вторая'),
    ])
  })

  it('requires inline confirmation before moving a hard choice', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ changed: true }) }) as jest.Mock
    props.onRefresh.mockResolvedValue(undefined)
    const hard = { ...mode.books[0], viewerStatus: 'hard' as const, allowedActions: { conditional: false, hard: false, cancelHard: true } }
    const target = { ...mode.books[0], bookId: 'b2', title: 'Вторая', viewerStatus: 'interest' as const, allowedActions: { conditional: false, hard: true, cancelHard: false } }
    render(<MatchingBooksView {...props} bookMode={{ ...mode, books: [hard, target] }} />)

    fireEvent.click(screen.getByTestId('matching-book-card-b2').querySelector('.nd-mb-btn.is-hard')!)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(screen.getByRole('group', { name: 'Подтверждение смены книги' })).toHaveTextContent('Первая')

    fireEvent.click(screen.getByRole('button', { name: 'Оставить как есть' }))
    expect(global.fetch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('matching-book-card-b2').querySelector('.nd-mb-btn.is-hard')!)
    fireEvent.click(screen.getByRole('button', { name: 'Перезаписаться' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      action: 'setHard', bookId: 'b2', expectedStateVersion: 3,
    })
  })

  it('keeps hard-choice feedback and cancellation on the selected card', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ changed: true }) }) as jest.Mock
    props.onRefresh.mockResolvedValue(undefined)
    const hard = { ...mode.books[0], viewerStatus: 'hard' as const, allowedActions: { conditional: false, hard: false, cancelHard: true } }
    render(<MatchingBooksView {...props} bookMode={{ ...mode, books: [hard] }} />)

    expect(screen.queryByTestId('matching-books-selection')).not.toBeInTheDocument()
    expect(screen.getByText('✓ Вы записаны')).toBeInTheDocument()
    expect(screen.getByText(/Что дальше: круг сформируется/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      action: 'cancelHard', bookId: 'b1', expectedStateVersion: 3,
    })
  })

  it('does not offer hard cancellation after the session closes', () => {
    const hard = { ...mode.books[0], viewerStatus: 'hard' as const, allowedActions: { conditional: false, hard: false, cancelHard: false } }
    render(<MatchingBooksView {...props} sessionStatus="closed" bookMode={{ ...mode, books: [hard] }} />)

    expect(screen.getByText('✓ Вы записаны')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отменить' })).not.toBeInTheDocument()
  })

  it('keeps a formed assignment and directs cancellation to the administrator', () => {
    global.fetch = jest.fn() as jest.Mock
    const assigned = { ...mode.books[0], formedAt: '2026-07-14T10:00:00Z', viewerStatus: 'assigned' as const, allowedActions: { conditional: false, hard: false, cancelHard: false } }
    render(<MatchingBooksView {...props} bookMode={{ ...mode, viewerAssignmentBookId: 'b1', books: [assigned] }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }))

    expect(global.fetch).not.toHaveBeenCalled()
    expect(screen.getByTestId('matching-books-message')).toHaveTextContent('Для отмены обратитесь к администратору.')
  })

  it('renders a single divider before the unpinned viewer-only tail', () => {
    const personalA = { ...mode.books[0], bookId: 'b2', title: 'Личная A', intersectionCount: 0 }
    const personalB = { ...mode.books[0], bookId: 'b3', title: 'Личная B', intersectionCount: 0 }
    render(<MatchingBooksView {...props} bookMode={{ ...mode, books: [mode.books[0], personalA, personalB] }} />)

    expect(screen.getAllByTestId('matching-viewer-only-divider')).toHaveLength(1)
    const divider = screen.getByTestId('matching-viewer-only-divider')
    const firstPersonalCard = screen.getByTestId('matching-book-card-b2')
    expect(divider.compareDocumentPosition(firstPersonalCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
