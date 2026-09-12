/**
 * @jest-environment jsdom
 */
import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import AdminMatchingSession from './AdminMatchingSession'

jest.mock('./SummaryMarkdown', () => ({
  __esModule: true,
  default: ({ markdown }: { markdown: string }) => <div>{markdown}</div>,
}))

const mockReplace = jest.fn()
let mockSearch = 'tab=matching'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(mockSearch),
}))

const SESSION_OPEN = {
  id: 'sess-open',
  name: 'Книжная сессия',
  status: 'open',
  deadlineAt: null,
  createdAt: '2026-07-13T10:00:00Z',
  stateVersion: 4,
}

const SESSION_CLOSED = {
  ...SESSION_OPEN,
  id: 'sess-closed',
  name: 'Закрытая книжная сессия',
  status: 'closed',
  stateVersion: 5,
}

const PARTICIPANTS = [
  {
    userId: 'user-1',
    publicRef: 'ref-abc',
    joinSource: 'self' as const,
    joinedAt: '2026-06-01T11:00:00Z',
    name: 'Иван Петров',
    role: 'active' as const,
    choices: { hard: ['Моби Дик'], conditional: ['Сто лет одиночества'], assigned: [] },
    wishlist: [{ title: 'Моби Дик', rank: 1 }, { title: 'Редкая книга', rank: 2 }],
    readingNow: [],
  },
  {
    userId: 'user-2',
    publicRef: 'ref-def',
    joinSource: 'admin' as const,
    joinedAt: '2026-06-01T12:00:00Z',
    name: 'Мария Орлова',
    role: 'observer' as const,
    choices: { hard: [], conditional: [], assigned: ['Над пропастью во ржи'] },
  },
]

const SUMMARY = {
  activeParticipants: 5,
  signedUpParticipants: 2,
  assignedParticipants: 1,
  readingParticipants: 1,
  demandedBooks: 1,
  formedCircles: 2,
}

const BOOK = {
  bookId: 'book-1',
  title: 'Моби Дик',
  author: 'Герман Мелвилл',
  interestedCount: 4,
  topThreeCount: 3,
  avgRank: 2.25,
  worstRank: 4,
  unrankedCount: 0,
  hardCount: 1,
  conditionalCount: 1,
  assignedCount: 1,
  formedCircleCount: 2,
  participants: [
    { userId: 'user-2', name: 'Мария Орлова', rank: 1, status: 'assigned', assignedCircleId: 'c-1', readingNow: [] },
    { userId: 'user-1', name: 'Иван Петров', rank: 2, status: 'signed_up', assignedCircleId: null, readingNow: [] },
    { userId: 'user-3', name: 'Олег', rank: 2, status: 'conditional', assignedCircleId: null, readingNow: [{ bookId: 'b9', title: 'Уроки химии' }] },
    { userId: 'user-4', name: 'Юля', rank: 4, status: 'wishlist', assignedCircleId: null, readingNow: [] },
  ],
}

const EVENTS = [
  {
    id: 'ev-1',
    sessionId: 'sess-open',
    eventType: 'self_join',
    source: 'matching',
    actorUserId: 'user-1',
    actorNameSnapshot: 'Иван Петров',
    subjectUserId: 'user-1',
    subjectNameSnapshot: 'Иван Петров',
    bookId: null,
    before: null,
    after: null,
    metadata: null,
    stateVersion: 1,
    occurredAt: '2026-06-01T11:00:00Z',
  },
  {
    id: 'ev-2',
    sessionId: 'sess-open',
    eventType: 'hard_set',
    source: 'matching',
    actorUserId: 'user-1',
    actorNameSnapshot: 'Иван Петров',
    subjectUserId: 'user-1',
    subjectNameSnapshot: 'Иван Петров',
    bookId: 'book-1',
    before: null,
    after: null,
    metadata: { bookTitle: 'Моби Дик' },
    stateVersion: 2,
    occurredAt: '2026-06-02T11:00:00Z',
  },
]

function mockFetch(handlers: Record<string, unknown>) {
  global.fetch = jest.fn((url: string) => {
    for (const [pattern, response] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(response) } as Response)
      }
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Not found' }) } as Response)
  }) as jest.Mock
}

function openSessionHandlers(overrides: Record<string, unknown> = {}) {
  return {
    '/api/matching/sessions': { data: [SESSION_OPEN, SESSION_CLOSED] },
    '/api/admin/matching/sessions/sess-open/coordination': { summary: SUMMARY, books: [BOOK] },
    '/api/admin/matching/sessions/sess-open/participants': { data: PARTICIPANTS, online: ['ref-abc'] },
    '/api/admin/matching/sessions/sess-closed/coordination': { summary: { ...SUMMARY, demandedBooks: 0 }, books: [] },
    '/api/admin/matching/sessions/sess-closed/participants': { data: [], online: [] },
    '/api/admin/matching/preference-events': { events: EVENTS },
    '/api/admin/users': { data: [{ id: 'user-9', name: 'Новый человек' }] },
    ...overrides,
  }
}

describe('AdminMatchingSession', () => {
  beforeEach(() => {
    mockSearch = 'tab=matching'
    mockReplace.mockClear()
  })
  afterEach(() => jest.restoreAllMocks())

  it('opens on the read-only book demand tab under a compact session bar and summary', async () => {
    mockFetch(openSessionHandlers())
    render(<AdminMatchingSession />)

    const demand = await screen.findByTestId('admin-matching-demand')
    await within(demand).findByText('Моби Дик')

    expect(screen.getByTestId('admin-matching-tab-demand')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('admin-matching-session-bar')).toHaveTextContent('Книжная сессия')
    expect(screen.getByTestId('admin-matching-session-status')).toHaveTextContent('открыта')
    expect(screen.getByTestId('admin-matching-session-bar')).toHaveTextContent('активных: 5')
    expect(screen.getByTestId('admin-matching-summary-activeParticipants')).toHaveTextContent('5')
    expect(screen.getByTestId('admin-matching-summary-formedCircles')).toHaveTextContent('2')

    const card = within(demand).getByTestId('admin-demand-book')
    expect(within(card).getByTestId('admin-demand-book-circles')).toHaveTextContent('кругов: 2')
    expect(within(card).getByTestId('admin-demand-book-aggregates')).toHaveTextContent('в списках: 4 · в топ-3: 3 · средний ранг: 2,3')
    expect(within(card).getAllByTestId('admin-demand-person').map((row) => row.getAttribute('data-status')))
      .toEqual(['assigned', 'signed_up', 'conditional', 'wishlist'])
    expect(within(card).getByText('в круге')).toBeInTheDocument()
    expect(within(card).getByText('записался')).toBeInTheDocument()
    expect(within(card).getByText('авто-запись')).toBeInTheDocument()
    expect(within(card).getByText('в списке')).toBeInTheDocument()
    expect(within(card).getByText('читает «Уроки химии»')).toBeInTheDocument()
    expect(within(card).queryByText('Герман Мелвилл')).not.toBeInTheDocument()

    // Extra metrics live in a tooltip attached to the focusable title.
    const tooltip = within(card).getByRole('tooltip', { hidden: true })
    expect(tooltip).toHaveTextContent('Худший ранг#4')
    expect(tooltip).toHaveTextContent('В круге1')
    const head = tooltip.parentElement!
    expect(head).toHaveAttribute('tabindex', '0')
    expect(head).toHaveAttribute('aria-describedby', tooltip.id)

    // Read-only: no actions inside the demand perspective.
    expect(within(demand).queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByText(/сценари/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/напишите|лучший кандидат/i)).not.toBeInTheDocument()
  })

  it('shows a quiet line when no book reaches three active overlaps', async () => {
    mockFetch(openSessionHandlers({
      '/api/admin/matching/sessions/sess-open/coordination': { summary: { ...SUMMARY, demandedBooks: 0 }, books: [] },
    }))
    render(<AdminMatchingSession />)

    expect(await screen.findByTestId('admin-demand-empty')).toHaveTextContent('Пока нет книг с тремя активными пересечениями')
  })

  it('switches sub-tabs through the URL and opens the one named in ?sub=', async () => {
    mockFetch(openSessionHandlers())
    render(<AdminMatchingSession />)
    await screen.findByTestId('admin-matching-demand')

    fireEvent.click(screen.getByTestId('admin-matching-tab-log'))
    expect(mockReplace).toHaveBeenCalledWith('/admin?tab=matching&sub=log', { scroll: false })
    expect(screen.getByTestId('admin-matching-tab-log')).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByTestId('admin-matching-log')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByTestId('admin-matching-tab-log'), { key: 'ArrowLeft' })
    expect(screen.getByTestId('admin-matching-tab-people')).toHaveAttribute('aria-selected', 'true')
  })

  it('falls back to the demand tab for an unknown ?sub= value', async () => {
    mockSearch = 'tab=matching&sub=nonsense'
    mockFetch(openSessionHandlers())
    render(<AdminMatchingSession />)

    expect(await screen.findByTestId('admin-matching-demand')).toBeInTheDocument()
  })

  it('opens the global instructions editor as its own matching sub-tab', async () => {
    mockSearch = 'tab=matching&sub=instructions'
    mockFetch(openSessionHandlers())
    render(<AdminMatchingSession />)

    expect(await screen.findByTestId('admin-matching-tab-instructions')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('admin-matching-instructions')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-matching-session-bar')).not.toBeInTheDocument()
  })

  it('keeps participant administration on the people tab', async () => {
    mockSearch = 'tab=matching&sub=people'
    jest.spyOn(window, 'confirm').mockReturnValue(true)
    mockFetch(openSessionHandlers())
    render(<AdminMatchingSession />)

    const people = await screen.findByTestId('admin-matching-people')
    await within(people).findByText('Иван Петров')

    const headers = within(people).getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual(['Имя', 'Роль', 'Источник', 'Вступил', 'Действие'])
    expect(within(people).getByText('Иван Петров').closest('a')).toHaveAttribute('href', '/matching?as=user-1')
    expect(within(people).getByTestId('admin-participant-online-dot')).toBeInTheDocument()
    expect(within(people).getAllByTestId('admin-participant-source').map((cell) => cell.textContent)).toEqual(['сам', 'админ'])
    expect(screen.queryByText(/Admininstrator/)).not.toBeInTheDocument()
    expect(within(people).getByText('активный')).toBeInTheDocument()
    expect(within(people).getByText('наблюдатель')).toBeInTheDocument()

    // Книги раскрываются кликом по строке и разложены по группам, книга на строку.
    expect(screen.queryByTestId('admin-participant-books')).not.toBeInTheDocument()
    const firstRow = within(people).getAllByTestId('admin-participant-row')[0]
    fireEvent.click(within(firstRow).getByTestId('admin-participant-nameslot'))
    expect(screen.queryByTestId('admin-participant-books')).not.toBeInTheDocument()
    fireEvent.click(firstRow)
    expect(firstRow).toHaveAttribute('aria-expanded', 'true')
    const books = within(people).getByTestId('admin-participant-books')
    const groups = within(books).getAllByTestId('admin-participant-book-group')
    expect(groups.map((group) => group.dataset.group)).toEqual(['want', 'hard', 'conditional'])
    expect(groups[0]).toHaveTextContent('Хочу читать')
    expect(within(groups[0]).getAllByRole('listitem').map((item) => item.textContent))
      .toEqual(['#1Моби Дик', '#2Редкая книга'])
    expect(groups[1]).toHaveTextContent('Записался:ась')
    expect(groups[2]).toHaveTextContent('Авто-запись')
    expect(groups[2]).toHaveTextContent('Сто лет одиночества')
    expect(books).not.toHaveTextContent('«')

    // Manual add is collapsed together with its warning.
    expect(screen.queryByTestId('admin-add-disclosure-warning')).not.toBeInTheDocument()
    fireEvent.click(within(people).getByTestId('admin-add-participant-toggle'))
    expect(screen.getByTestId('admin-add-disclosure-warning')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('admin-add-participant-select'), { target: { value: 'user-9' } })
    fireEvent.click(screen.getByTestId('admin-add-participant-submit'))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/matching/sessions/sess-open/participants',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ userId: 'user-9' }) }),
    ))

    fireEvent.click(within(people).getAllByTestId('admin-participant-remove')[0])
    expect(window.confirm).toHaveBeenCalledWith('Убрать Иван Петров из сессии «Книжная сессия»?')
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/matching/sessions/sess-open/participants/user-1',
      { method: 'DELETE' },
    ))
  })

  it('marks a participant whose circle was released to reading', async () => {
    mockSearch = 'tab=matching&sub=people'
    mockFetch(openSessionHandlers({
      '/api/admin/matching/sessions/sess-open/participants': {
        data: [{ ...PARTICIPANTS[1], completedAt: '2026-09-09T19:00:00.000Z' }],
        online: [],
      },
    }))
    render(<AdminMatchingSession />)

    const people = await screen.findByTestId('admin-matching-people')
    await within(people).findByText('Мария Орлова')
    expect(within(people).getByTestId('admin-participant-released')).toHaveTextContent('читает')
    fireEvent.click(within(people).getByTestId('admin-participant-row'))
    const releasedBooks = within(people).getByTestId('admin-participant-books')
    expect(within(releasedBooks).getByTestId('admin-participant-book-group')).toHaveAttribute('data-group', 'assigned')
    expect(releasedBooks).toHaveTextContent('Читает')
    expect(releasedBooks).toHaveTextContent('Над пропастью во ржи')
    expect(releasedBooks).not.toHaveTextContent('В круге')
  })

  it('reopens a closed session and keeps participant mutation unavailable while closed', async () => {
    mockSearch = 'tab=matching&sub=people'
    jest.spyOn(window, 'confirm').mockReturnValue(true)
    mockFetch({
      '/api/matching/sessions': { data: [SESSION_CLOSED] },
      '/api/admin/matching/sessions/sess-closed/coordination': { summary: SUMMARY, books: [] },
      '/api/admin/matching/sessions/sess-closed/participants': { data: PARTICIPANTS, online: [] },
      '/api/admin/matching/preference-events': { events: [] },
      '/api/admin/users': { data: [] },
      '/api/admin/matching/sessions/sess-closed/book-admin-actions': { stateVersion: 6 },
    })
    render(<AdminMatchingSession />)

    await waitFor(() => expect(screen.getByTestId('admin-reopen-session')).toBeInTheDocument())
    await screen.findByText('Иван Петров')
    expect(screen.queryByTestId('admin-add-participant-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-participant-remove')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('admin-reopen-session'))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/matching/sessions/sess-closed/book-admin-actions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'reopenSession', expectedStateVersion: 5 }),
      }),
    ))
  })

  it('keeps journal filters and folds the event-type summary', async () => {
    mockSearch = 'tab=matching&sub=log'
    mockFetch(openSessionHandlers())
    render(<AdminMatchingSession />)

    const log = await screen.findByTestId('admin-matching-log')
    await within(log).findByTestId('admin-matching-preference-events')
    expect(within(log).getByTestId('admin-matching-preference-filters')).toBeInTheDocument()
    expect(within(log).getAllByText('Окончательная запись').length).toBeGreaterThan(0)
    expect(screen.queryByText('hard_set')).not.toBeInTheDocument()

    expect(screen.queryByTestId('admin-matching-event-totals')).not.toBeInTheDocument()
    fireEvent.click(within(log).getByTestId('admin-matching-event-totals-toggle'))
    expect(within(log).getByTestId('admin-matching-event-totals')).toHaveTextContent('Вход в сессию1')

    expect(screen.queryByTestId('admin-matching-preference-reset')).not.toBeInTheDocument()
    fireEvent.change(within(log).getByLabelText('Фильтр по событию'), { target: { value: 'hard_set' } })
    expect(within(log).getByTestId('admin-matching-preference-reset')).toBeInTheDocument()
    expect(within(log).getByTestId('admin-matching-preference-events')).not.toHaveTextContent('Вход в сессию')
  })

  it('switches sessions from the session menu and offers creation as a secondary action', async () => {
    mockFetch(openSessionHandlers())
    render(<AdminMatchingSession />)
    await screen.findByTestId('admin-demand-book')

    fireEvent.click(screen.getByTestId('admin-matching-session-menu'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    // Creation is not part of the default flow and stays blocked while a session is open.
    expect(screen.queryByTestId('matching-session-name')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('admin-matching-session-menu'))
    fireEvent.click(screen.getByTestId('admin-matching-new-session'))
    expect(screen.getByTestId('matching-session-name')).toBeDisabled()
    expect(screen.getByText('Уже есть открытая сессия. Сначала закройте её, затем создайте новую.')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('admin-matching-session-menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Закрытая книжная сессия/ }))
    expect(await screen.findByTestId('admin-demand-empty')).toBeInTheDocument()
    expect(screen.getByTestId('admin-matching-session-status')).toHaveTextContent('закрыта')
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/matching/sessions/sess-closed/coordination')
  })
})
