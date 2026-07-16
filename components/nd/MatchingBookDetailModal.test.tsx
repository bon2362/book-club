import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MatchingBookDetailModal, { type MatchingBookDetail } from './MatchingBookDetailModal'

jest.mock('./CoverImage', () => ({
  __esModule: true,
  default: () => <div data-testid="cover" />,
}))

const book: MatchingBookDetail = {
  bookId: 'b1',
  bookSlug: 'kniga',
  title: 'Книга',
  author: 'Автор',
  description: 'Описание',
  coverUrl: null,
  pages: 100,
  publishedDate: '2026',
  textUrl: '',
  whyRead: null,
  recommendationLink: null,
  tags: [],
  personalStatus: 'read',
  isInList: true,
}

describe('MatchingBookDetailModal summary action', () => {
  beforeEach(() => {
    delete (window as Partial<Window>).location
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    })
  })

  it('shows a write summary action for read books without an existing summary', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ summary: null }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ summary: { id: 's1', status: 'draft' } }) }) as jest.Mock

    render(<MatchingBookDetailModal book={book} frozen={false} onClose={() => {}} />)

    const button = await screen.findByRole('button', { name: /написать саммари/i })
    fireEvent.click(button)

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/summaries/by-book/b1', expect.objectContaining({ method: 'POST' })))
    expect(window.location.href).toBe('/summaries/s1/edit')
  })

  it('shows pending and published states', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ summary: { id: 's2', status: 'pending' } }) }) as jest.Mock
    const { rerender } = render(<MatchingBookDetailModal book={book} frozen={false} onClose={() => {}} />)

    expect(await screen.findByText('Саммари на проверке')).toBeInTheDocument()

    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ summary: { id: 's3', status: 'published' } }) })
    rerender(<MatchingBookDetailModal book={{ ...book, bookId: 'b2' }} frozen={false} onClose={() => {}} />)

    expect(await screen.findByRole('link', { name: 'Читать саммари' })).toHaveAttribute('href', '/books/kniga/summaries')
    expect(screen.getByRole('link', { name: 'Редактировать' })).toHaveAttribute('href', '/books/kniga/my-summary/edit')
  })
})

describe('MatchingBookDetailModal matching participants', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'PointerEvent', { configurable: true, value: MouseEvent })
  })

  it('shows the complete named list including simple interest', () => {
    render(
      <MatchingBookDetailModal
        book={{ ...book, personalStatus: null }}
        frozen
        onClose={() => {}}
        matchingParticipants={[
          { ref: 'p1', displayName: 'Анна', status: 'hard', rank: 1 },
          { ref: 'p2', displayName: 'Борис', status: 'interest', rank: 4 },
        ]}
      />,
    )
    const list = screen.getByTestId('matching-book-participant-list')
    expect(list).toHaveTextContent('Анна')
    expect(list).toHaveTextContent('уже записал:ась')
    expect(list).toHaveTextContent('Борис')
    expect(list).toHaveTextContent('пока только в списке')
  })

  it('shows a rank tooltip on focus and tap', () => {
    render(
      <MatchingBookDetailModal
        book={{ ...book, personalStatus: null }}
        frozen
        onClose={() => {}}
        matchingParticipants={[{ ref: 'p1', displayName: 'Анна', status: 'hard', rank: 4 }]}
      />,
    )
    const participant = screen.getByRole('button', { name: /Анна.*уже записал:ась/i })

    fireEvent.focus(participant)
    expect(screen.getByRole('tooltip')).toHaveTextContent('У Анна на 4 месте')
    fireEvent.blur(participant)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.click(participant)
    expect(screen.getByRole('tooltip')).toHaveTextContent('У Анна на 4 месте')
  })

  it('keeps the rank tooltip open while the pointer moves over it', () => {
    render(
      <MatchingBookDetailModal
        book={{ ...book, personalStatus: null }}
        frozen
        onClose={() => {}}
        matchingParticipants={[{ ref: 'p1', displayName: 'Анна', status: 'interest', rank: 2 }]}
      />,
    )
    const participant = screen.getByRole('button', { name: /Анна.*пока только в списке/i })
    const item = participant.closest('li')!

    fireEvent.mouseEnter(item)
    const tooltip = screen.getByRole('tooltip')
    fireEvent.mouseEnter(tooltip)
    expect(tooltip).toBeInTheDocument()
    fireEvent.mouseLeave(item)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('closes after a downward drag past the sheet threshold', () => {
    const onClose = jest.fn()
    render(<MatchingBookDetailModal book={{ ...book, personalStatus: null }} frozen onClose={onClose} />)
    const handle = screen.getByTestId('matching-book-sheet-drag-handle')

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 20 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 130 })
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 130 })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('snaps back after a short downward drag', () => {
    const onClose = jest.fn()
    render(<MatchingBookDetailModal book={{ ...book, personalStatus: null }} frozen onClose={onClose} />)
    const handle = screen.getByTestId('matching-book-sheet-drag-handle')
    const dialog = screen.getByRole('dialog')

    fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientY: 20 })
    fireEvent.pointerMove(handle, { pointerId: 2, clientY: 65 })
    expect(dialog).toHaveStyle({ transform: 'translateY(45px)' })
    fireEvent.pointerUp(handle, { pointerId: 2, clientY: 65 })

    expect(onClose).not.toHaveBeenCalled()
    expect(dialog).not.toHaveStyle({ transform: 'translateY(45px)' })
  })

  it('also exposes the drag handle as a keyboard close control', () => {
    const onClose = jest.fn()
    render(<MatchingBookDetailModal book={{ ...book, personalStatus: null }} frozen onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Потяните лист вниз' }), { detail: 0 })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
