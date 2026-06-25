import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MatchingBookDetailModal, { type MatchingBookDetail } from './MatchingBookDetailModal'

jest.mock('./CoverImage', () => ({
  __esModule: true,
  default: () => <div data-testid="cover" />,
}))

const book: MatchingBookDetail = {
  bookId: 'b1',
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

    expect(await screen.findByRole('link', { name: 'Читать саммари' })).toHaveAttribute('href', '/books/b2/summaries')
    expect(screen.getByRole('link', { name: 'Редактировать' })).toHaveAttribute('href', '/summaries/s3/edit')
  })
})
