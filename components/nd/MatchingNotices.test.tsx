import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MatchingNotices from './MatchingNotices'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: () => refresh() }) }))

beforeEach(() => {
  refresh.mockClear()
  ;(global.fetch as unknown) = jest.fn()
})

function notice(over: Partial<{ id: string; kind: string; payload: Record<string, unknown> }> = {}) {
  return {
    id: over.id ?? 'n1',
    kind: over.kind ?? 'circle_locked',
    payload: over.payload ?? {},
    createdAt: '2026-06-29T10:00:00.000Z',
  }
}

test('renders nothing when there are no notices', () => {
  const { container } = render(<MatchingNotices sessionId="s1" notices={[]} />)
  expect(container).toBeEmptyDOMElement()
})

test('renders human messages for each notice kind', () => {
  render(
    <MatchingNotices
      sessionId="s1"
      notices={[
        notice({ id: 'n1', kind: 'confirmation_transferred', payload: { fromMembers: ['Анна', 'Борис'], toMembers: ['Анна', 'Вера'] } }),
        notice({ id: 'n2', kind: 'confirmation_invalidated', payload: { members: ['Анна', 'Глеб'] } }),
        notice({ id: 'n3', kind: 'circle_locked', payload: {} }),
      ]}
    />,
  )
  expect(screen.getByText(/перенесено/i)).toBeInTheDocument()
  expect(screen.getByText(/Вера/)).toBeInTheDocument()
  expect(screen.getByText(/распал/i)).toBeInTheDocument()
  expect(screen.getByText(/закреплён/i)).toBeInTheDocument()
})

test('acks a notice and removes it only after a successful response', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true })
  render(<MatchingNotices sessionId="s1" notices={[notice({ id: 'n1' })]} />)

  fireEvent.click(screen.getByRole('button', { name: /понятно/i }))

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/matching/notices/n1/ack',
    expect.objectContaining({ method: 'POST' }),
  ))
  await waitFor(() => expect(screen.queryByText(/закреплён/i)).toBeNull())
})

test('keeps the notice visible when the ack request fails', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false })
  render(<MatchingNotices sessionId="s1" notices={[notice({ id: 'n1' })]} />)

  fireEvent.click(screen.getByRole('button', { name: /понятно/i }))

  await waitFor(() => expect(global.fetch).toHaveBeenCalled())
  expect(screen.getByText(/закреплён/i)).toBeInTheDocument()
})
