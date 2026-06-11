/**
 * @jest-environment jsdom
 */
import { render, waitFor } from '@testing-library/react'
import { forwardRef } from 'react'
import BooksPage from './BooksPage'
import { writeRememberedAuthProvider } from './auth-provider-memory'
import { useSession } from 'next-auth/react'

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}))

jest.mock('./auth-provider-memory', () => ({
  ...jest.requireActual('./auth-provider-memory'),
  writeRememberedAuthProvider: jest.fn(),
}))

jest.mock('@/lib/scroll-hide-context', () => ({
  useScrollHide: () => ({ isHidden: false }),
}))

jest.mock('@/lib/user-email', () => ({
  getUserContactEmail: () => null,
}))

jest.mock('./Header', () => ({
  __esModule: true,
  default: () => <header data-testid="header" />,
}))
jest.mock('./BookCard', () => ({
  __esModule: true,
  default: () => <div data-testid="book-card" />,
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
const mockWriteRememberedAuthProvider = writeRememberedAuthProvider as jest.Mock

describe('BooksPage auth memory', () => {
  beforeEach(() => {
    mockWriteRememberedAuthProvider.mockClear()
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
  })

  it('persists a remembered auth provider when session.user.provider is valid', async () => {
    render(
      <BooksPage
        books={[]}
        currentUser={{
          timestamp: '2026-01-01T00:00:00Z',
          userId: 'user-1',
          name: 'Иван',
          email: null,
          contacts: '@ivan',
          selectedBooks: [],
          selectedBookIds: [],
          signups: [],
        }}
        tagDescriptions={{}}
        introHeader={{ title: 'Intro', body: 'Body' }}
        introSections={[]}
      />
    )

    await waitFor(() => {
      expect(mockWriteRememberedAuthProvider).toHaveBeenCalledWith('google')
    })
  })
})
