/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import AdminMatchingSession from './AdminMatchingSession'

// next/link mock
jest.mock('next/link', () => {
  const MockLink = ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  )
  MockLink.displayName = 'MockLink'
  return MockLink
})

const SESSION_ACTIVE = {
  id: 'sess-1',
  name: 'Июньская встреча',
  status: 'active',
  minGroupSize: 3,
  maxGroupSize: 3,
  deadlineAt: null,
  createdAt: '2026-06-01T10:00:00Z',
  frozenAt: null,
}

const SESSION_FROZEN = {
  id: 'sess-2',
  name: 'Майская встреча',
  status: 'frozen',
  minGroupSize: 3,
  maxGroupSize: 3,
  deadlineAt: null,
  createdAt: '2026-05-01T10:00:00Z',
  frozenAt: '2026-05-15T12:00:00Z',
  frozenScenarioJson: {
    remainingLeader: {
      circles: [{ circleKey: 'snapshot-circle', bookId: 'book-snapshot', memberUserIds: ['user-1', 'user-2'] }],
    },
  },
}

const PARTICIPANTS = [
  {
    userId: 'user-1',
    publicRef: 'ref-abc',
    joinSource: 'self' as const,
    joinedAt: '2026-06-01T11:00:00Z',
    name: 'Иван Петров',
    role: 'active' as const,
  },
  {
    userId: 'user-2',
    publicRef: 'ref-xyz',
    joinSource: 'admin' as const,
    joinedAt: '2026-06-01T12:00:00Z',
    name: 'Мария Иванова',
    role: 'observer' as const,
  },
]

const LOCKED_CIRCLE = {
  id: 'circle-1',
  sessionId: 'sess-1',
  circleKey: 'key-abc',
  bookId: 'book-1',
  bookTitle: 'Война и мир',
  status: 'locked' as const,
  lockedAt: '2026-06-02T10:00:00Z',
  dissolvedAt: null,
  dissolveReason: null,
  members: [
    { userId: 'user-2', displayNameSnapshot: 'Мария Иванова', releasedAt: null },
  ],
}

const EVENTS = [
  {
    id: 'ev-1',
    sessionId: 'sess-1',
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
  },
]

function mockFetch(handlers: Record<string, unknown>) {
  global.fetch = jest.fn((url: string) => {
    for (const [pattern, response] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(response),
        } as Response)
      }
    }
    return Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ error: 'Not found' }),
    } as Response)
  }) as jest.Mock
}

describe('AdminMatchingSession', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders loading state initially', () => {
    mockFetch({})
    render(<AdminMatchingSession />)
    expect(screen.getByText('Загрузка…')).toBeInTheDocument()
  })

  it('shows session switcher after load', async () => {
    mockFetch({
      '/api/matching/sessions': { data: [SESSION_ACTIVE, SESSION_FROZEN] },
      '/api/admin/matching/sessions/sess-1/participants': { data: [], online: [] },
      '/api/admin/matching/sessions/sess-1/locked-circles': { data: [] },
      '/api/admin/matching/preference-events': { events: [] },
      '/api/admin/users': { data: [] },
    })

    render(<AdminMatchingSession />)

    await waitFor(() => {
      expect(screen.getAllByText('Июньская встреча').length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText('Майская встреча').length).toBeGreaterThan(0)
  })

  it('shows optimizationMode is NOT present in create form', async () => {
    mockFetch({
      '/api/matching/sessions': { data: [] },
    })

    render(<AdminMatchingSession />)

    await waitFor(() => {
      expect(screen.queryByTestId('matching-session-mode')).not.toBeInTheDocument()
    })
  })

  it('shows real name, joinSource and role in participants table', async () => {
    mockFetch({
      '/api/matching/sessions': { data: [SESSION_ACTIVE] },
      '/api/admin/matching/sessions/sess-1/participants': { data: PARTICIPANTS, online: ['ref-abc'] },
      '/api/admin/matching/sessions/sess-1/locked-circles': { data: [] },
      '/api/admin/matching/preference-events': { events: [] },
      '/api/admin/users': { data: [] },
    })

    render(<AdminMatchingSession />)

    await waitFor(() => {
      expect(screen.getByText('Иван Петров')).toBeInTheDocument()
    })

    // Real name appears
    expect(screen.getByText('Мария Иванова')).toBeInTheDocument()

    // Online dot for user-1 (ref-abc is online)
    expect(screen.getByTestId('admin-participant-online-dot')).toBeInTheDocument()

    // joinSource labels
    expect(screen.getByText('Сам')).toBeInTheDocument()
    expect(screen.getByText('Admininstrator')).toBeInTheDocument()

    // Role labels
    expect(screen.getByText('активный')).toBeInTheDocument()
    expect(screen.getByText('наблюдатель')).toBeInTheDocument()
  })

  it('shows admin-add disclosure warning', async () => {
    mockFetch({
      '/api/matching/sessions': { data: [SESSION_ACTIVE] },
      '/api/admin/matching/sessions/sess-1/participants': { data: [], online: [] },
      '/api/admin/matching/sessions/sess-1/locked-circles': { data: [] },
      '/api/admin/matching/preference-events': { events: [] },
      '/api/admin/users': { data: [] },
    })

    render(<AdminMatchingSession />)

    await waitFor(() => {
      expect(screen.getByTestId('admin-add-disclosure-warning')).toBeInTheDocument()
    })
  })

  it('disables remove for observer participants with explanation', async () => {
    mockFetch({
      '/api/matching/sessions': { data: [SESSION_ACTIVE] },
      '/api/admin/matching/sessions/sess-1/participants': { data: PARTICIPANTS, online: [] },
      '/api/admin/matching/sessions/sess-1/locked-circles': { data: [] },
      '/api/admin/matching/preference-events': { events: [] },
      '/api/admin/users': { data: [] },
    })

    render(<AdminMatchingSession />)

    await waitFor(() => {
      expect(screen.getByTestId('remove-observer-disabled')).toBeInTheDocument()
    })
    expect(screen.getByTestId('remove-observer-disabled')).toHaveTextContent('сначала распустить круг')
  })

  it('shows locked circles registry', async () => {
    mockFetch({
      '/api/matching/sessions': { data: [SESSION_ACTIVE] },
      '/api/admin/matching/sessions/sess-1/participants': { data: PARTICIPANTS, online: [] },
      '/api/admin/matching/sessions/sess-1/locked-circles': { data: [LOCKED_CIRCLE] },
      '/api/admin/matching/preference-events': { events: [] },
      '/api/admin/users': { data: [] },
    })

    render(<AdminMatchingSession />)

    await waitFor(() => {
      expect(screen.getByText('Война и мир')).toBeInTheDocument()
    })

    expect(screen.getByTestId('locked-circle-row')).toBeInTheDocument()
    expect(screen.getByTestId('dissolve-circle-btn')).toBeInTheDocument()
  })

  it('opens dissolve dialog with book and member info', async () => {
    mockFetch({
      '/api/matching/sessions': { data: [SESSION_ACTIVE] },
      '/api/admin/matching/sessions/sess-1/participants': { data: PARTICIPANTS, online: [] },
      '/api/admin/matching/sessions/sess-1/locked-circles': { data: [LOCKED_CIRCLE] },
      '/api/admin/matching/preference-events': { events: [] },
      '/api/admin/users': { data: [] },
    })

    render(<AdminMatchingSession />)

    await waitFor(() => screen.getByTestId('dissolve-circle-btn'))

    fireEvent.click(screen.getByTestId('dissolve-circle-btn'))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
    // Book and member shown in dialog
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Война и мир')
    expect(dialog).toHaveTextContent('Мария Иванова')
    expect(screen.getByTestId('dissolve-reason-input')).toBeInTheDocument()
  })

  it('disables dissolve submit when reason is empty', async () => {
    mockFetch({
      '/api/matching/sessions': { data: [SESSION_ACTIVE] },
      '/api/admin/matching/sessions/sess-1/participants': { data: PARTICIPANTS, online: [] },
      '/api/admin/matching/sessions/sess-1/locked-circles': { data: [LOCKED_CIRCLE] },
      '/api/admin/matching/preference-events': { events: [] },
      '/api/admin/users': { data: [] },
    })

    render(<AdminMatchingSession />)

    await waitFor(() => screen.getByTestId('dissolve-circle-btn'))
    fireEvent.click(screen.getByTestId('dissolve-circle-btn'))

    await waitFor(() => screen.getByTestId('dissolve-confirm-btn'))
    expect(screen.getByTestId('dissolve-confirm-btn')).toBeDisabled()
  })

  it('shows analytics section with matching_events data', async () => {
    mockFetch({
      '/api/matching/sessions': { data: [SESSION_ACTIVE] },
      '/api/admin/matching/sessions/sess-1/participants': { data: [], online: [] },
      '/api/admin/matching/sessions/sess-1/locked-circles': { data: [] },
      '/api/admin/matching/preference-events': { events: EVENTS },
      '/api/admin/users': { data: [] },
    })

    render(<AdminMatchingSession />)

    await waitFor(() => {
      expect(screen.getByTestId('admin-matching-preference-events')).toBeInTheDocument()
    })

    // Section title preserved
    expect(screen.getByText(/Аналитика изменений предпочтений/)).toBeInTheDocument()

    // Uses new event type labels (appears in chip + table row)
    expect(screen.getAllByText('Вход в сессию').length).toBeGreaterThan(0)

    // Uses name snapshot (not pseudonym) — appears in actor/subject columns
    expect(screen.getAllByText('Иван Петров').length).toBeGreaterThan(0)
  })

  it('shows frozen session as read-only (no freeze button, no add participant)', async () => {
    mockFetch({
      '/api/matching/sessions': { data: [SESSION_FROZEN] },
      '/api/admin/matching/sessions/sess-2/participants': { data: [], online: [] },
      '/api/admin/matching/sessions/sess-2/locked-circles': { data: [] },
      '/api/admin/matching/preference-events': { events: [] },
      '/api/admin/users': { data: [] },
    })

    render(<AdminMatchingSession />)

    await waitFor(() => {
      expect(screen.getByText('Сессия зафиксирована — данные доступны только для просмотра')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('admin-freeze-session')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-add-disclosure-warning')).not.toBeInTheDocument()
    const snapshot = screen.getByTestId('admin-frozen-snapshot')
    expect(snapshot).toHaveTextContent('Снимок оставшегося сценария')
    expect(snapshot).toHaveTextContent('book-snapshot')
    expect(snapshot).toHaveTextContent('2 участника')
    expect(snapshot).not.toHaveTextContent(/подтвержд[её]нн.*круг/i)
  })
})
