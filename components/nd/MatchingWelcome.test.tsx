import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MatchingWelcome from './MatchingWelcome'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: () => refresh() }),
}))

beforeEach(() => {
  refresh.mockClear()
  ;(global.fetch as unknown) = jest.fn()
})

const base = { sessionId: 's1', sessionName: 'Тест', initialName: 'Анна' }

test('renders the session name as heading', () => {
  render(<MatchingWelcome {...base} />)
  expect(screen.getByRole('heading', { name: 'Тест' })).toBeInTheDocument()
})

test('pre-fills the name input with initialName', () => {
  render(<MatchingWelcome {...base} />)
  const input = screen.getByTestId('welcome-name-input') as HTMLInputElement
  expect(input.value).toBe('Анна')
})

test('shows disclosure about real names', () => {
  render(<MatchingWelcome {...base} />)
  expect(screen.getByText(/реальные имена видны всем участникам/i)).toBeInTheDocument()
})

test('no Telegram CTA present', () => {
  render(<MatchingWelcome {...base} />)
  expect(screen.queryByText(/telegram/i)).toBeNull()
})

test('name can be edited inline', () => {
  render(<MatchingWelcome {...base} />)
  const input = screen.getByTestId('welcome-name-input') as HTMLInputElement
  fireEvent.change(input, { target: { value: 'Борис' } })
  expect(input.value).toBe('Борис')
})

test('validates empty name and shows error without fetching', () => {
  render(<MatchingWelcome {...base} initialName="" />)
  fireEvent.click(screen.getByTestId('welcome-join-button'))
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(global.fetch).not.toHaveBeenCalled()
})

test('submits join with name and refreshes on success', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) })
  render(<MatchingWelcome {...base} />)
  fireEvent.click(screen.getByTestId('welcome-join-button'))
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/matching/sessions/s1/join',
    expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"name":"Анна"'),
    }),
  ))
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
})

test('shows error when join fails', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({ error: 'session_frozen' }) })
  render(<MatchingWelcome {...base} />)
  fireEvent.click(screen.getByTestId('welcome-join-button'))
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  expect(screen.getByRole('alert')).toHaveTextContent('session_frozen')
})
