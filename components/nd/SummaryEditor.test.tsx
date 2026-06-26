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

const revision = {
  id: 'r1',
  summaryId: 's1',
  displayName: 'Алина',
  title: 'Новая версия',
  tldr: 'Новое коротко',
  bodyMarkdown: 'Новый текст',
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

  it('gives the main markdown body a large page-like workspace', () => {
    render(<SummaryEditor initialSummary={summary} bookTitle="Книга" bookAuthor="Автор" />)

    expect(screen.getByTestId('summary-editor-workspace')).toHaveStyle({
      maxWidth: '920px',
    })
    expect(screen.getByTestId('summary-editor-toolbar')).toHaveStyle({
      position: 'sticky',
    })
    expect(screen.getByLabelText('Текст саммари')).toHaveStyle({
      minHeight: '65vh',
    })
  })

  it('labels pending and published summaries truthfully', () => {
    const { rerender } = render(
      <SummaryEditor
        initialSummary={{ ...summary, status: 'pending' }}
        initialRevision={null}
        bookTitle="Книга"
        bookAuthor="Автор"
      />,
    )
    expect(screen.getByText('На проверке')).toBeInTheDocument()

    rerender(
      <SummaryEditor
        initialSummary={{ ...summary, status: 'published' }}
        initialRevision={null}
        bookTitle="Книга"
        bookAuthor="Автор"
      />,
    )
    expect(screen.getByText('Опубликовано')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Редактировать' })).toBeInTheDocument()
    expect(screen.getByLabelText('Заголовок саммари')).toBeDisabled()
  })

  it('creates and autosaves a revision from published state', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ revision }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ revision: { ...revision, title: 'Исправлено' } }) }) as jest.Mock

    render(
      <SummaryEditor
        initialSummary={{ ...summary, status: 'published' }}
        initialRevision={null}
        bookTitle="Книга"
        bookAuthor="Автор"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }))
    await waitFor(() => expect(screen.getByText('Правки: черновик')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Заголовок саммари'), { target: { value: 'Исправлено' } })
    act(() => { jest.advanceTimersByTime(900) })

    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith('/api/summary-revisions/r1', expect.objectContaining({
      method: 'PATCH',
      body: expect.stringContaining('Исправлено'),
    })))
  })

  it('submits a revision through the revision endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ revision: { ...revision, status: 'pending' } }),
    }) as jest.Mock

    render(
      <SummaryEditor
        initialSummary={{ ...summary, status: 'published' }}
        initialRevision={revision}
        bookTitle="Книга"
        bookAuthor="Автор"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Отправить на проверку' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/summary-revisions/r1/submit', expect.objectContaining({
      method: 'POST',
    })))
  })

  it('keeps a pending revision read-only and shows its status', () => {
    render(
      <SummaryEditor
        initialSummary={{ ...summary, status: 'published' }}
        initialRevision={{ ...revision, status: 'pending' }}
        bookTitle="Книга"
        bookAuthor="Автор"
      />,
    )

    expect(screen.getByText('Правки на проверке')).toBeInTheDocument()
    expect(screen.getByLabelText('Заголовок саммари')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отправить на проверку' })).toBeDisabled()
  })
})
