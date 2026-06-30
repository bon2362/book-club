import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MatchingHeader from './MatchingHeader'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const base = {
  sessionId: 'session-safe', sessionName: 'Июльский круг', sessionStatus: 'active',
  minGroupSize: 3, maxGroupSize: 4, deadlineAt: null,
  viewer: { displayName: 'Анна', role: 'active' as const },
  participants: [
    { ref: 'safe-a', displayName: 'Анна', online: true },
    { ref: 'safe-b', displayName: 'Борис', online: false },
  ],
  isAdmin: false, isImpersonating: false,
}

beforeEach(() => { push.mockClear(); global.fetch = jest.fn() as unknown as typeof fetch; window.confirm = jest.fn(() => true) })

test('renders safe session orientation and real-name participant popover', () => {
  render(<MatchingHeader {...base} />)
  expect(screen.getByRole('link', { name: /каталог/i })).toHaveAttribute('href', '/')
  expect(screen.getByRole('heading', { name: 'Июльский круг' })).toBeInTheDocument()
  expect(screen.getByText('Группы 3–4')).toBeInTheDocument()
  expect(screen.getByText(/Вы —/)).toHaveTextContent('Анна')
  fireEvent.click(screen.getByRole('button', { name: /участники/i }))
  expect(screen.getByRole('dialog', { name: /участники/i })).toHaveTextContent('Анна')
  expect(screen.getByRole('dialog', { name: /участники/i })).toHaveTextContent('Борис')
  expect(screen.queryByText(/псевдоним|мои ходы|лента/i)).toBeNull()
})

test('shows observer identity and hides leave while impersonating', () => {
  const { rerender } = render(<MatchingHeader {...base} viewer={{ displayName: 'Анна', role: 'observer' }} />)
  expect(screen.getByText('Вы наблюдаете')).toBeInTheDocument()
  rerender(<MatchingHeader {...base} isAdmin isImpersonating viewer={{ displayName: 'Анна', role: 'active' }} />)
  expect(screen.getByTestId('admin-impersonation-banner')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Покинуть' })).toBeNull()
})

test('confirms leave, calls safe route and navigates to matching', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true })
  render(<MatchingHeader {...base} />)
  fireEvent.click(screen.getByRole('button', { name: 'Покинуть' }))
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/matching/sessions/session-safe/leave', { method: 'DELETE' }))
  expect(push).toHaveBeenCalledWith('/matching')
})

test('keeps leave errors visible', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({ error: 'Нельзя выйти' }) })
  render(<MatchingHeader {...base} />)
  fireEvent.click(screen.getByRole('button', { name: 'Покинуть' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Нельзя выйти')
  expect(push).not.toHaveBeenCalled()
})
