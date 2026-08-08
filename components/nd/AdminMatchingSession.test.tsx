/**
 * @jest-environment jsdom
 */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AdminMatchingSession from './AdminMatchingSession'

const SESSION_OPEN = {
  id: 'sess-open',
  name: 'Книжная сессия',
  status: 'open',
  deadlineAt: null,
  createdAt: '2026-07-13T10:00:00Z',
  stateVersion: 4,
}

const SESSION_CLOSED = {
  ...SESSION_OPEN,
  id: 'sess-closed',
  name: 'Закрытая книжная сессия',
  status: 'closed',
  stateVersion: 5,
}

const PARTICIPANTS = [{
  userId: 'user-1',
  publicRef: 'ref-abc',
  joinSource: 'self' as const,
  joinedAt: '2026-06-01T11:00:00Z',
  name: 'Иван Петров',
  role: 'active' as const,
}]

const EVENTS = [{
  id: 'ev-1',
  sessionId: 'sess-open',
  eventType: 'self_join',
  source: 'matching',
  actorUserId: 'user-1',
  actorNameSnapshot: 'Иван Петров',
  subjectUserId: 'user-1',
  subjectNameSnapshot: 'Иван Петров',
  bookId: null,
  before: null,
  after: null,
  metadata: null,
  stateVersion: 1,
  occurredAt: '2026-06-01T11:00:00Z',
}]

function mockFetch(handlers: Record<string, unknown>) {
  global.fetch = jest.fn((url: string) => {
    for (const [pattern, response] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(response) } as Response)
      }
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Not found' }) } as Response)
  }) as jest.Mock
}

describe('AdminMatchingSession', () => {
  afterEach(() => jest.restoreAllMocks())

  it('shows one canonical open session with participants and event analytics', async () => {
    mockFetch({
      '/api/matching/sessions': { data: [SESSION_OPEN] },
      '/api/admin/matching/sessions/sess-open/participants': { data: PARTICIPANTS, online: ['ref-abc'] },
      '/api/admin/matching/preference-events': { events: EVENTS },
      '/api/admin/users': { data: [] },
    })

    render(<AdminMatchingSession />)

    await waitFor(() => expect(screen.getAllByText('Иван Петров').length).toBeGreaterThan(0))
    expect(screen.getAllByText('Открыта').length).toBeGreaterThan(0)
    expect(screen.getByTestId('admin-participant-online-dot')).toBeInTheDocument()
    expect(screen.getByTestId('admin-add-disclosure-warning')).toBeInTheDocument()
    expect(screen.getByTestId('admin-matching-preference-events')).toBeInTheDocument()
    expect(screen.queryByText(/сценари/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/закреплённые круги/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Размер группы')).not.toBeInTheDocument()
    expect(screen.queryByText(/Размер:/)).not.toBeInTheDocument()
  })

  it('reopens a closed session and keeps participant mutation unavailable while closed', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true)
    mockFetch({
      '/api/matching/sessions': { data: [SESSION_CLOSED] },
      '/api/admin/matching/sessions/sess-closed/participants': { data: [], online: [] },
      '/api/admin/matching/preference-events': { events: [] },
      '/api/admin/users': { data: [] },
      '/api/admin/matching/sessions/sess-closed/book-admin-actions': { stateVersion: 6 },
    })

    render(<AdminMatchingSession />)

    await waitFor(() => expect(screen.getByTestId('admin-reopen-session')).toBeInTheDocument())
    expect(screen.queryByTestId('admin-add-disclosure-warning')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('admin-reopen-session'))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/matching/sessions/sess-closed/book-admin-actions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'reopenSession', expectedStateVersion: 5 }),
      }),
    ))
  })
})
