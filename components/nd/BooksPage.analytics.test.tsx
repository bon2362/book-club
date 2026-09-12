/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { forwardRef } from 'react'
import BooksPage from './BooksPage'
import { useSession } from 'next-auth/react'
import { track } from '@/lib/analytics'
import type { BookWithCover } from '@/lib/books-with-covers'

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}))

jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
}))

jest.mock('./CoverImage', () => ({
  __esModule: true,
  default: () => <div data-testid="cover-image" />,
}))

jest.mock('@/lib/scroll-hide-context', () => ({
  useScrollHide: () => ({ isHidden: false }),
}))

jest.mock('@/lib/user-email', () => ({
  getUserContactEmail: () => null,
}))

jest.mock('./auth-provider-memory', () => ({
  ...jest.requireActual('./auth-provider-memory'),
  writeRememberedAuthProvider: jest.fn(),
}))

jest.mock('./Header', () => ({
  __esModule: true,
  default: ({ onEditProfile, onSubmitBook }: { onEditProfile?: () => void; onSubmitBook?: () => void }) => (
    <header data-testid="header">
      {onEditProfile && <button onClick={onEditProfile}>header-profile</button>}
      {onSubmitBook && <button onClick={onSubmitBook}>header-submit</button>}
    </header>
  ),
}))
jest.mock('./BookRow', () => ({
  __esModule: true,
  default: () => <div data-testid="book-row" />,
}))
jest.mock('./AuthModal', () => ({
  __esModule: true,
  default: () => <div data-testid="auth-modal" />,
}))
jest.mock('./ContactsForm', () => ({
  __esModule: true,
  default: () => <div data-testid="contacts-form" />,
}))
jest.mock('./ProfileDrawer', () => ({
  __esModule: true,
  default: () => <div data-testid="profile-drawer" />,
}))
jest.mock('./SubmitBookForm', () => ({
  __esModule: true,
  default: () => <div data-testid="submit-book-form" />,
}))
jest.mock('./SubmitBookCard', () => ({
  __esModule: true,
  default: ({ onClick }: { onClick: () => void }) => <button data-testid="submit-book-card" onClick={onClick} />,
}))
jest.mock('./Footer', () => ({
  __esModule: true,
  default: () => <footer data-testid="footer" />,
}))
jest.mock('./FeedbackForm', () => ({
  __esModule: true,
  default: () => <div data-testid="feedback-form" />,
}))
jest.mock('./AboutBlock', () => {
  const MockAboutBlock = forwardRef<HTMLElement>(function MockAboutBlock() {
    return <section data-testid="about-block" />
  })
  MockAboutBlock.displayName = 'MockAboutBlock'
  return {
    __esModule: true,
    default: MockAboutBlock,
  }
})

const mockSession = useSession as jest.Mock
const mockTrack = track as jest.Mock

const book: BookWithCover = {
  id: 'book-1',
  name: 'Сапиенс',
  author: 'Юваль Харари',
  tags: ['история', 'наука'],
  description: 'А'.repeat(150),
  date: '1/1/2011',
  pages: '500',
  link: '',
  type: 'Book',
  coverUrl: null,
  whyRead: null,
  recommendationLink: null,
  isNew: false,
  summaryCount: 0,
}

const currentUser = {
  timestamp: '2026-01-01T00:00:00Z',
  userId: 'user-1',
  name: 'Иван',
  email: null,
  contacts: '@ivan',
  selectedBooks: [],
  selectedBookIds: [],
  signups: [],
}

function renderPage() {
  return render(
    <BooksPage
      books={[book]}
      currentUser={currentUser}
      tagDescriptions={{}}
      introHeader={{ title: 'Intro', body: 'Body' }}
      introSections={[]}
      initialAboutVisible={false}
      initialViewMode="grid"
      initialShowRead={false}
    />
  )
}

describe('BooksPage book choice analytics', () => {
  beforeEach(() => {
    mockTrack.mockClear()
    mockSession.mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          provider: 'google',
          isAdmin: false,
          contactEmail: null,
        },
      },
    })
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch
  })

  it('book_signup содержит expanded_before: false, если описание не разворачивали', async () => {
    renderPage()

    const [signupButton] = screen.getAllByRole('button', { name: /хочу читать/i })
    fireEvent.click(signupButton)

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith(
        'book_signup',
        expect.objectContaining({
          book_id: 'book-1',
          expanded_before: false,
        })
      )
    })
  })

  it('book_signup содержит expanded_before: true, если описание разворачивали до записи', async () => {
    renderPage()

    const [expandButton] = screen.getAllByRole('button', { name: /читать далее/i })
    fireEvent.click(expandButton)

    expect(mockTrack).toHaveBeenCalledWith(
      'book_card_expanded',
      expect.objectContaining({ book_id: 'book-1' })
    )

    const [signupButton] = screen.getAllByRole('button', { name: /хочу читать/i })
    fireEvent.click(signupButton)

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith(
        'book_signup',
        expect.objectContaining({
          book_id: 'book-1',
          tags: ['история', 'наука'],
          position: 1,
          expanded_before: true,
        })
      )
    })
  })

  it('выбор темы в фильтре шлёт catalog_filter_changed со значением и числом найденных книг', async () => {
    const { container } = renderPage()

    const tagSelect = container.querySelector('.filters-select-tag') as HTMLSelectElement
    fireEvent.change(tagSelect, { target: { value: 'история' } })

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith('catalog_filter_changed', {
        filter: 'tag',
        value: 'история',
        results_count: 1,
      })
    })
  })

  it('сброс фильтра записывается как «все»', async () => {
    const { container } = renderPage()
    const tagSelect = container.querySelector('.filters-select-tag') as HTMLSelectElement

    fireEvent.change(tagSelect, { target: { value: 'история' } })
    fireEvent.change(tagSelect, { target: { value: '' } })

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith('catalog_filter_changed', expect.objectContaining({ filter: 'tag', value: 'все' }))
    })
  })

  it('поиск шлёт одно событие с запросом после паузы, а не на каждую букву', async () => {
    renderPage()
    const search = screen.getByPlaceholderText('Поиск по названию или автору…')

    fireEvent.change(search, { target: { value: 'Са' } })
    fireEvent.change(search, { target: { value: 'Сапи' } })
    fireEvent.change(search, { target: { value: 'Сапиенс' } })

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith('catalog_searched', {
        query: 'Сапиенс',
        query_length: 7,
        results_count: 1,
      })
    }, { timeout: 2000 })
    const searches = mockTrack.mock.calls.filter(([event]) => event === 'catalog_searched')
    expect(searches).toHaveLength(1)
  })

  it('поиск по несуществующей книге сообщает ноль результатов', async () => {
    renderPage()
    fireEvent.change(screen.getByPlaceholderText('Поиск по названию или автору…'), { target: { value: 'Капитал' } })

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith('catalog_searched', expect.objectContaining({ query: 'Капитал', results_count: 0 }))
    }, { timeout: 2000 })
  })

  it('переключение вида шлёт catalog_view_changed', () => {
    renderPage()
    fireEvent.click(screen.getByTitle('Переключить в таблицу'))
    expect(mockTrack).toHaveBeenCalledWith('catalog_view_changed', { mode: 'list' })
  })

  it('«Предложить книгу» в шапке и в каталоге различаются местом нажатия', () => {
    renderPage()

    fireEvent.click(screen.getByText('header-submit'))
    expect(mockTrack).toHaveBeenCalledWith('submit_book_clicked', { entry_point: 'header', is_logged_in: true })

    fireEvent.click(screen.getAllByTestId('submit-book-card')[0])
    expect(mockTrack).toHaveBeenCalledWith('submit_book_clicked', { entry_point: 'catalog_card', is_logged_in: true })
  })

  it('клик по имени в шапке шлёт profile_opened', () => {
    renderPage()
    fireEvent.click(screen.getByText('header-profile'))
    expect(mockTrack).toHaveBeenCalledWith('profile_opened', { source: 'header' })
  })
})
