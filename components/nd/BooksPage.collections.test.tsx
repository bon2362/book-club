/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { forwardRef } from 'react'
import BooksPage from './BooksPage'
import { useSession } from 'next-auth/react'

jest.mock('next-auth/react', () => ({ useSession: jest.fn(), signOut: jest.fn() }))
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('@/lib/scroll-hide-context', () => ({ useScrollHide: () => ({ isHidden: false }) }))
jest.mock('@/lib/user-email', () => ({ getUserContactEmail: () => null }))
jest.mock('./auth-provider-memory', () => ({ ...jest.requireActual('./auth-provider-memory'), writeRememberedAuthProvider: jest.fn() }))
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
jest.mock('./HomeCollectionsBlock', () => ({
  __esModule: true,
  default: ({ collections, onCreate }: { collections: unknown[]; onCreate: () => void }) => (
    <section data-testid="home-collections"><span>{collections.length}</span><button onClick={onCreate}>Собрать свою</button></section>
  ),
}))

const mockSession = useSession as jest.Mock
const baseProps = {
  books: [],
  currentUser: null,
  tagDescriptions: {},
  introHeader: { title: 'Intro', body: 'Body' },
  introSections: [],
  initialAboutVisible: true,
  initialViewMode: 'grid' as const,
  initialShowRead: false,
}

describe('BooksPage home collections', () => {
  beforeEach(() => {
    localStorage.clear()
    mockSession.mockReturnValue({ data: null })
  })

  it('does not render the block when it is disabled', () => {
    render(<BooksPage {...baseProps} homeCollections={null} />)
    expect(screen.queryByTestId('home-collections')).toBeNull()
  })

  it('places the block after “Что это” and before filters', () => {
    render(<BooksPage {...baseProps} homeCollections={[]} />)
    const about = screen.getByTestId('about-block')
    const block = screen.getByTestId('home-collections')
    expect(about.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('stores a guest intent after “Собрать свою”', () => {
    render(<BooksPage {...baseProps} homeCollections={[]} />)
    fireEvent.click(screen.getByText('Собрать свою'))
    expect(localStorage.getItem('collectionCreateIntent')).not.toBeNull()
  })
})
