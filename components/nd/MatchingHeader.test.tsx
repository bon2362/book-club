import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import MatchingHeader from './MatchingHeader'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const base = {
  sessionId: 'session-safe', sessionName: 'Июльский круг', sessionStatus: 'active', stateVersion: 7,
  minGroupSize: 3, maxGroupSize: 4, deadlineAt: null,
  viewer: { displayName: 'Анна', role: 'active' as const },
  participants: [
    { ref: 'safe-a', displayName: 'Анна', online: true },
    { ref: 'safe-b', displayName: 'Борис', online: false },
  ],
  isAdmin: false, isImpersonating: false,
}

beforeEach(() => { global.fetch = jest.fn() as unknown as typeof fetch; window.confirm = jest.fn(() => true); refresh.mockClear() })

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
  const banner = screen.getByTestId('admin-impersonation-banner')
  expect(banner).toBeInTheDocument()
  expect(banner.getElementsByTagName('a')[0]).toHaveAttribute('href', '/admin?tab=matching')
  expect(screen.queryByRole('button', { name: 'Покинуть' })).toBeNull()
})

test('confirms leave with the current version and hard-navigates to matching', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true })
  const navigate = jest.fn()
  render(<MatchingHeader {...base} navigate={navigate} />)
  fireEvent.click(screen.getByRole('button', { name: 'Покинуть' }))
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/matching/sessions/session-safe/leave', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedStateVersion: 7 }),
  }))
  expect(navigate).toHaveBeenCalledWith('/matching')
})

test('refreshes local state after a leave conflict so an immediate retry uses the new version', async () => {
  ;(global.fetch as jest.Mock)
    .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: 'stale_version' }) })
    .mockResolvedValueOnce({ ok: true })
  const navigate = jest.fn()
  const view: { rerender?: ReturnType<typeof render>['rerender'] } = {}
  const onSessionRefresh = jest.fn(async () => {
    view.rerender!(<MatchingHeader {...base} stateVersion={8} navigate={navigate} onSessionRefresh={onSessionRefresh} />)
  })
  view.rerender = render(<MatchingHeader {...base} navigate={navigate} onSessionRefresh={onSessionRefresh} />).rerender
  fireEvent.click(screen.getByRole('button', { name: 'Покинуть' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/данные обновлены/i)
  expect(onSessionRefresh).toHaveBeenCalledTimes(1)
  expect(refresh).toHaveBeenCalledTimes(1)
  expect(navigate).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Покинуть' }))
  await waitFor(() => expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/matching/sessions/session-safe/leave', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedStateVersion: 8 }),
  }))
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

test('renders robust Russian deadline plurals and expiry states', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-07-01T00:00:00.000Z'))
  const { rerender } = render(<MatchingHeader {...base} deadlineAt={null} />)
  expect(screen.getByText('Дедлайн не задан')).toBeInTheDocument()
  for (const [days, label] of [[1, '1 день'], [2, '2 дня'], [5, '5 дней'], [11, '11 дней'], [21, '21 день'], [22, '22 дня']] as const) {
    rerender(<MatchingHeader {...base} deadlineAt={new Date(Date.now() + days * 86_400_000).toISOString()} />)
    expect(screen.getByText(`Дедлайн через ${label}`)).toBeInTheDocument()
  }
  rerender(<MatchingHeader {...base} deadlineAt="2026-06-30T23:59:00.000Z" />)
  expect(screen.getByText('Дедлайн истёк')).toBeInTheDocument()
  jest.useRealTimers()
})

test('updates the deadline label when it expires while mounted', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-07-01T00:00:30.000Z'))
  render(<MatchingHeader {...base} deadlineAt="2026-07-01T00:00:45.000Z" />)
  expect(screen.getByText('Дедлайн через 1 день')).toBeInTheDocument()
  act(() => { jest.advanceTimersByTime(15_001) })
  expect(screen.getByText('Дедлайн истёк')).toBeInTheDocument()
  jest.useRealTimers()
})

test('participant popover is keyboard accessible and restores trigger focus', async () => {
  render(<MatchingHeader {...base} />)
  const trigger = screen.getByRole('button', { name: /участники/i })
  trigger.focus()
  fireEvent.keyDown(trigger, { key: 'Enter' })
  fireEvent.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(trigger).toHaveAttribute('aria-controls')
  const dialog = screen.getByRole('dialog', { name: 'Участники' })
  expect(dialog).toBeInTheDocument()
  const close = screen.getByRole('button', { name: 'Закрыть список участников' })
  await waitFor(() => expect(close).toHaveFocus())
  fireEvent.keyDown(close, { key: 'Tab' })
  fireEvent.keyDown(dialog, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Участники' })).toBeNull())
  await waitFor(() => expect(trigger).toHaveFocus())

  fireEvent.click(trigger)
  expect(screen.getByRole('dialog', { name: 'Участники' })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Закрыть список участников' })).toHaveFocus())
  fireEvent.pointerDown(document.body, { button: 0, pointerType: 'mouse' })
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Участники' })).toBeNull())
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
