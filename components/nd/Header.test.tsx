import { render, screen } from '@testing-library/react'
import Header from './Header'

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null }),
}))

jest.mock('@/lib/scroll-hide-context', () => ({
  useScrollHide: () => ({ isHidden: false }),
}))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  global.ResizeObserver = ResizeObserverMock as typeof ResizeObserver
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
