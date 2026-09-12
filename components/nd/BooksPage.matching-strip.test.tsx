/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { forwardRef } from 'react'
import BooksPage from './BooksPage'
import { useSession } from 'next-auth/react'
import { track } from '@/lib/analytics'

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}))

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('@/lib/scroll-hide-context', () => ({ useScrollHide: () => ({ isHidden: false }) }))
jest.mock('@/lib/user-email', () => ({ getUserContactEmail: () => null }))
jest.mock('./auth-provider-memory', () => ({
  ...jest.requireActual('./auth-provider-memory'),
  writeRememberedAuthProvider: jest.fn(),
}))
jest.mock('./Header', () => ({ __esModule: true, default: () => <header data-testid="header" /> }))
jest.mock('./BookCard', () => ({ __esModule: true, default: () => <article /> }))
jest.mock('./BookRow', () => ({ __esModule: true, default: () => <article /> }))
jest.mock('./BookCardMobile', () => ({ __esModule: true, default: () => <article /> }))
jest.mock('./AuthModal', () => ({ __esModule: true, default: () => null }))
jest.mock('./ContactsForm', () => ({ __esModule: true, default: () => null }))
jest.mock('./ProfileDrawer', () => ({ __esModule: true, default: () => null }))
jest.mock('./SubmitBookForm', () => ({ __esModule: true, default: () => null }))
jest.mock('./SubmitBookCard', () => ({ __esModule: true, default: () => null }))
jest.mock('./Footer', () => ({ __esModule: true, default: () => null }))
jest.mock('./FeedbackForm', () => ({ __esModule: true, default: () => null }))
jest.mock('./AboutBlock', () => {
  const MockAboutBlock = forwardRef<HTMLElement>(function MockAboutBlock() { return <section data-testid="about-block" /> })
  return { __esModule: true, default: MockAboutBlock }
})

const mockSession = useSession as jest.Mock
const mockTrack = track as jest.Mock

function renderPage(matchingStripSessionId: string | null) {
  return render(
    <BooksPage
      books={[]}
      currentUser={null}
      tagDescriptions={{}}
      introHeader={{ title: 'Intro', body: 'Body' }}
      introSections={[]}
      initialAboutVisible={false}
      initialViewMode="grid"
      initialShowRead={false}
      matchingStripSessionId={matchingStripSessionId}
    />
  )
}

describe('BooksPage matching strip', () => {
  beforeEach(() => {
    mockSession.mockReturnValue({ data: { user: { id: 'user-1', isAdmin: false } } })
    mockTrack.mockClear()
    document.cookie = 'matching_strip_dismissed=; path=/; max-age=0'
  })

  it('shows the strip for an open matching session', () => {
    renderPage('session-42')

    expect(screen.getByText('Идёт матчинг')).toBeInTheDocument()
  })

  it('does not show the strip without an open session id', () => {
    renderPage(null)

    expect(screen.queryByText('Идёт матчинг')).not.toBeInTheDocument()
  })

  it('dismisses the strip for the current session id', () => {
    renderPage('session-42')

    fireEvent.click(screen.getByRole('button', { name: 'Скрыть полосу матчинга' }))

    expect(screen.queryByText('Идёт матчинг')).not.toBeInTheDocument()
    expect(document.cookie).toContain('matching_strip_dismissed=session-42')
    expect(mockTrack).toHaveBeenCalledWith('matching_strip_dismissed', { source: 'home' })
  })

  it('links to matching and records the strip click', () => {
    renderPage('session-42')

    const link = screen.getByRole('link', { name: /перейти в матчинг/i })
    fireEvent.click(link)

    expect(link).toHaveAttribute('href', '/matching')
    expect(mockTrack).toHaveBeenCalledWith('matching_strip_clicked', { source: 'home' })
  })
})
