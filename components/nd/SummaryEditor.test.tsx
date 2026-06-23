import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SummaryEditor from './SummaryEditor'

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div>{children}</div>,
}))

const summary = {
  id: 's1',
  bookId: 'b1',
  displayName: 'Алина',
  title: 'Институты',
  tldr: 'Коротко',
  bodyMarkdown: 'Текст',
  status: 'draft' as const,
  rejectionReason: null,
}

describe('SummaryEditor', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ summary: { ...summary, title: 'Новый заголовок' } }),
    }) as jest.Mock
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('autosaves draft edits after debounce', async () => {
    render(<SummaryEditor initialSummary={summary} bookTitle="Книга" bookAuthor="Автор" />)

    fireEvent.change(screen.getByLabelText('Заголовок саммари'), { target: { value: 'Новый заголовок' } })
    act(() => { jest.advanceTimersByTime(900) })

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/summaries/s1', expect.objectContaining({
      method: 'PATCH',
      body: expect.stringContaining('Новый заголовок'),
    })))
  })

  it('shows rejection reason and submits after final save', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ summary }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ summary: { ...summary, status: 'pending' } }) }) as jest.Mock

    render(<SummaryEditor initialSummary={{ ...summary, status: 'rejected', rejectionReason: 'Добавь выводы' }} bookTitle="Книга" bookAuthor="Автор" />)

    expect(screen.getByText('Добавь выводы')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Отправить на проверку' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/summaries/s1/submit', expect.objectContaining({ method: 'POST' })))
  })

  it('toggles preview', () => {
    render(<SummaryEditor initialSummary={summary} bookTitle="Книга" bookAuthor="Автор" />)

    fireEvent.click(screen.getByRole('button', { name: 'Предпросмотр' }))

    expect(screen.getByText('Коротко')).toBeInTheDocument()
  })
})
