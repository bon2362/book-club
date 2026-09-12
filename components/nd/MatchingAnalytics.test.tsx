/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { track } from '@/lib/analytics'
import MatchingWelcome from './MatchingWelcome'
import MatchingNotices from './MatchingNotices'
import MatchingInstructions from './MatchingInstructions'
import MatchingBooksView from './MatchingBooksView'
import BookDetailProvider, { useBookDetail } from './BookDetailProvider'
import MatchingBookCircles from './MatchingBookCircles'
import MatchingRankNudge from './MatchingRankNudge'
import { DEFAULT_MATCHING_INSTRUCTIONS } from '@/lib/matching/instructions-content'
import type { MatchingBookModeState } from './matching-book-types'
import type { MatchingBookDetail } from './MatchingBookDetailModal'

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))
jest.mock('./SummaryMarkdown', () => ({
  __esModule: true,
  default: ({ markdown }: { markdown: string }) => <div>{markdown}</div>,
}))

const mockTrack = track as jest.Mock

beforeEach(() => {
  mockTrack.mockClear()
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch
})

describe('экран знакомства', () => {
  const base = { sessionId: 's1', sessionName: 'Осенний сезон', initialName: 'Иван' }

  it('показ экрана шлёт matching_welcome_shown', () => {
    render(<MatchingWelcome {...base} />)
    expect(mockTrack).toHaveBeenCalledWith('matching_welcome_shown', { session_id: 's1' })
  })

  it('успешное вступление шлёт matching_welcome_joined', async () => {
    render(<MatchingWelcome {...base} />)
    fireEvent.click(screen.getByTestId('welcome-join-button'))
    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith('matching_welcome_joined', { session_id: 's1', name_changed: false })
    })
  })

  it('пустое имя шлёт matching_welcome_join_failed с причиной', () => {
    render(<MatchingWelcome {...base} initialName="" />)
    fireEvent.click(screen.getByTestId('welcome-join-button'))
    expect(mockTrack).toHaveBeenCalledWith('matching_welcome_join_failed', { session_id: 's1', reason: 'name_required' })
  })

  it('ошибка сервера шлёт matching_welcome_join_failed', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'nope' }) }) as unknown as typeof fetch
    render(<MatchingWelcome {...base} />)
    fireEvent.click(screen.getByTestId('welcome-join-button'))
    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith('matching_welcome_join_failed', { session_id: 's1', reason: 'request_failed' })
    })
  })
})

describe('уведомления, инструкция, подсказка', () => {
  it('закрытие уведомления шлёт его тип', () => {
    render(<MatchingNotices sessionId="s1" notices={[{ id: 'n1', kind: 'circle_locked', payload: {}, createdAt: '2026-06-29T10:00:00.000Z' }]} />)
    fireEvent.click(screen.getByRole('button'))
    expect(mockTrack).toHaveBeenCalledWith('matching_notice_dismissed', { kind: 'circle_locked' })
  })

  it('раскрытие и сворачивание инструкции', () => {
    render(<MatchingInstructions instructions={DEFAULT_MATCHING_INSTRUCTIONS} />)
    fireEvent.click(screen.getByRole('button', { name: DEFAULT_MATCHING_INSTRUCTIONS.expandLabel }))
    expect(mockTrack).toHaveBeenCalledWith('matching_instructions_expanded')
    fireEvent.click(screen.getByRole('button', { name: DEFAULT_MATCHING_INSTRUCTIONS.collapseLabel }))
    expect(mockTrack).toHaveBeenCalledWith('matching_instructions_collapsed')
  })

  it('закрытие подсказки о приоритетах', () => {
    sessionStorage.clear()
    render(<MatchingRankNudge show />)
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть подсказку' }))
    expect(mockTrack).toHaveBeenCalledWith('matching_rank_nudge_dismissed')
  })
})

describe('доска книг', () => {
  const peers = [
    { ref: 'viewer', displayName: 'Я', status: 'interest', rank: 1 },
    { ref: 'first-peer', displayName: 'Первый', status: 'interest', rank: 1 },
    { ref: 'second-peer', displayName: 'Второй', status: 'interest', rank: 2 },
  ]
  const mode = {
    initializedAt: '2026-07-13T10:00:00.000Z',
    viewerAssignmentBookIds: [],
    books: [
      {
        bookId: 'b1', title: 'Первая', author: 'Автор', coverUrl: null,
        intersectionCount: 1, formedAt: null, currentViability: 'unformed', viewerStatus: 'interest',
        participants: peers, circles: [], unplacedParticipantRefs: [],
        allowedActions: { conditional: true, hard: true, cancelHard: false },
      },
      {
        bookId: 'b2', title: 'Только у меня', author: 'Автор', coverUrl: null,
        intersectionCount: 0, formedAt: null, currentViability: 'unformed', viewerStatus: 'interest',
        participants: [peers[0]], circles: [], unplacedParticipantRefs: [],
        allowedActions: { conditional: false, hard: false, cancelHard: false },
      },
    ],
  } as unknown as MatchingBookModeState
  const props = {
    sessionId: 's1', stateVersion: 3, sessionStatus: 'open', viewerRef: 'viewer',
    bookMode: mode, booksById: {}, isAdmin: false, onState: jest.fn(), onRefresh: jest.fn(),
  }

  it('раскрытие раздела «Записаться пока нельзя» шлёт число книг в нём', () => {
    render(<MatchingBooksView {...props} />)
    fireEvent.click(screen.getByTestId('matching-tail-toggle'))
    expect(mockTrack).toHaveBeenCalledWith('matching_unavailable_books_expanded', { count: 1 })
  })

  it('открытие карточки книги шлёт её id', () => {
    const book = {
      bookId: 'b1', title: 'Тест-книга', author: 'Автор', description: '', coverUrl: null,
      pages: null, publishedDate: '', textUrl: '', whyRead: null, recommendationLink: null, tags: [],
    } as MatchingBookDetail
    function Opener() {
      const { openBook } = useBookDetail()
      return <button onClick={() => openBook(book, [])}>open</button>
    }
    render(<BookDetailProvider personalBooks={[]} viewingUserId="u1" frozen={false}><Opener /></BookDetailProvider>)
    act(() => { screen.getByText('open').click() })
    expect(mockTrack).toHaveBeenCalledWith('matching_book_detail_opened', { book_id: 'b1' })
  })

  it('«Согласовать время» у своего круга', () => {
    render(
      <MatchingBookCircles
        circles={[{ id: 'c1', position: 1, memberRefs: ['r1', 'r2', 'r3'] }]}
        participants={['r1', 'r2', 'r3'].map((ref, index) => ({ ref, displayName: `Читатель ${index}`, status: 'assigned', rank: index + 1 }))}
        viewerRef="r1"
        bookId="b1"
      />,
    )
    fireEvent.click(screen.getByText('Согласовать время'))
    expect(mockTrack).toHaveBeenCalledWith('matching_calendar_link_clicked', {
      book_id: 'b1', circle_position: 1, is_mine: true, admin_mode: false,
    })
  })
})
