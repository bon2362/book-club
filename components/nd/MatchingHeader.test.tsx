import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MatchingHeader from './MatchingHeader'

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

beforeEach(() => { global.fetch = jest.fn() as unknown as typeof fetch; window.confirm = jest.fn(() => true) })

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
  const navigate = jest.fn()
  render(<MatchingHeader {...base} navigate={navigate} />)
  fireEvent.click(screen.getByRole('button', { name: 'Покинуть' }))
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/matching/sessions/session-safe/leave', { method: 'DELETE' }))
  expect(navigate).toHaveBeenCalledWith('/matching')
})

test('keeps leave errors visible', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({ error: 'Нельзя выйти' }) })
  const navigate = jest.fn()
  render(<MatchingHeader {...base} navigate={navigate} />)
  fireEvent.click(screen.getByRole('button', { name: 'Покинуть' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Нельзя выйти')
  expect(navigate).not.toHaveBeenCalled()
})

test.each([
  [null, 'Дедлайн не задан'],
  ['2099-07-03T12:00:00.000Z', /Дедлайн через/],
  ['2020-01-01T00:00:00.000Z', 'Дедлайн истёк'],
])('always renders deadline metadata for %s', (deadlineAt, expected) => {
  render(<MatchingHeader {...base} deadlineAt={deadlineAt} />)
  expect(screen.getByText(expected)).toBeInTheDocument()
})

test('admin edits active group size and refreshes the public state', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) })
  const onSessionRefresh = jest.fn().mockResolvedValue(undefined)
  render(<MatchingHeader {...base} isAdmin onSessionRefresh={onSessionRefresh} />)
  fireEvent.click(screen.getByRole('button', { name: /изменить размер групп/i }))
  fireEvent.change(screen.getByLabelText('Минимум участников'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('Максимум участников'), { target: { value: '5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/matching/sessions/session-safe', expect.objectContaining({
    method: 'PATCH', body: JSON.stringify({ minGroupSize: 2, maxGroupSize: 5 }),
  })))
  expect(onSessionRefresh).toHaveBeenCalledTimes(1)
})

test('validates group size locally and allows cancel', () => {
  render(<MatchingHeader {...base} isAdmin />)
  fireEvent.click(screen.getByRole('button', { name: /изменить размер групп/i }))
  fireEvent.change(screen.getByLabelText('Минимум участников'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
  expect(screen.getByRole('alert')).toHaveTextContent(/минимум 2/i)
  expect(global.fetch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
  expect(screen.queryByLabelText('Минимум участников')).toBeNull()
})

test('shows group-size API errors and hides editing for participants and frozen sessions', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({ error: 'Размер занят' }) })
  const { rerender } = render(<MatchingHeader {...base} isAdmin />)
  fireEvent.click(screen.getByRole('button', { name: /изменить размер групп/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Размер занят')
  rerender(<MatchingHeader {...base} />)
  expect(screen.queryByRole('button', { name: /изменить размер групп/i })).toBeNull()
  rerender(<MatchingHeader {...base} isAdmin sessionStatus="frozen" />)
  expect(screen.queryByRole('button', { name: /изменить размер групп/i })).toBeNull()
})
