import { fireEvent, render, screen } from '@testing-library/react'
import { track } from '@/lib/analytics'
import Header from './Header'

const mockSession = jest.fn()

jest.mock('next-auth/react', () => ({
  useSession: () => mockSession(),
}))

jest.mock('@/lib/scroll-hide-context', () => ({
  useScrollHide: () => ({ isHidden: false }),
}))

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  global.ResizeObserver = ResizeObserverMock as typeof ResizeObserver
})

beforeEach(() => {
  mockSession.mockReturnValue({ data: null })
  jest.mocked(track).mockClear()
})

test('does not expose a timeline link in the public header', () => {
  render(<Header />)

  expect(screen.queryByRole('link', { name: 'Лента времени' })).not.toBeInTheDocument()
})

test('keeps admin access after removing the timeline link', () => {
  render(<Header isAdmin />)

  expect(screen.queryByRole('link', { name: 'Лента времени' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Админ' })).toHaveAttribute('href', '/admin')
})

test('shows the collections link to a guest', () => {
  render(<Header onSignIn={jest.fn()} />)

  expect(screen.getByRole('link', { name: 'Подборки' })).toHaveAttribute('href', '/collections')
})

test('shows the collections link to a signed-in reader', () => {
  mockSession.mockReturnValue({ data: { user: { id: 'u1', name: 'Аня' } } })
  render(<Header onEditProfile={jest.fn()} displayName="Аня" />)

  expect(screen.getByRole('link', { name: 'Подборки' })).toBeInTheDocument()
})

test('tracks opening collections from the header', () => {
  render(<Header onSignIn={jest.fn()} />)

  fireEvent.click(screen.getByRole('link', { name: 'Подборки' }))

  expect(track).toHaveBeenCalledWith('collections_opened', { source: 'header' })
})
