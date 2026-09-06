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
  default: () => <header data-testid="header" />,
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
  default: () => <button data-testid="submit-book-card" />,
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
})
