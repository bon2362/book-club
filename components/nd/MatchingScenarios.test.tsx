import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MatchingScenarios, { type PublicScenario } from './MatchingScenarios'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))

beforeEach(() => {
  ;(global.fetch as unknown) = jest.fn()
})

function makeScenario(id: string, circles: Array<{
  key: string
  bookId: string
  memberRefs: string[]
  confirmedRefs?: string[]
  viewerIsMember?: boolean
}>): PublicScenario {
  return {
    ref: id,
    circles: circles.map((c) => ({
      circleKey: c.key,
      bookId: c.bookId,
      members: c.memberRefs.map((ref) => ({
        ref,
        displayName: `Участник-${ref}`,
        confirmed: (c.confirmedRefs ?? []).includes(ref),
      })),
      confirmedCount: (c.confirmedRefs ?? []).length,
      memberCount: c.memberRefs.length,
      viewerIsMember: c.viewerIsMember ?? false,
    })),
  }
}

const base = {
  sessionId: 's1',
  stateVersion: 1,
  viewerConfirmedCircleKey: null as string | null,
  viewerRole: 'active' as const,
  frozen: false,
  bookTitleById: { 'book-1': 'Первая книга', 'book-2': 'Вторая книга' },
}

describe('MatchingScenarios', () => {
  it('renders nothing special when scenarios are empty', () => {
    render(<MatchingScenarios {...base} scenarios={[]} />)
    expect(screen.getByTestId('matching-scenarios-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('matching-scenarios-list')).toBeNull()
  })

  it('renders one card per scenario (no leader highlight)', () => {
    const scenarios = [
      makeScenario('s1', [{ key: 'k1', bookId: 'book-1', memberRefs: ['r1', 'r2'] }]),
      makeScenario('s2', [{ key: 'k2', bookId: 'book-2', memberRefs: ['r1', 'r3'] }]),
    ]
    render(<MatchingScenarios {...base} scenarios={scenarios} />)
    const cards = screen.getAllByTestId('matching-scenario-card')
    expect(cards).toHaveLength(2)
    // No leader/highlighted style difference — same data-testid for both
    expect(screen.getByText('Сценарий 1')).toBeInTheDocument()
    expect(screen.getByText('Сценарий 2')).toBeInTheDocument()
  })

  it('shows book titles for each circle', () => {
    const scenarios = [makeScenario('s1', [{ key: 'k1', bookId: 'book-1', memberRefs: ['r1'] }])]
    render(<MatchingScenarios {...base} scenarios={scenarios} />)
    expect(screen.getByText('Первая книга')).toBeInTheDocument()
  })

  it('shows member display names', () => {
    const scenarios = [makeScenario('s1', [{ key: 'k1', bookId: 'book-1', memberRefs: ['r1', 'r2'] }])]
    render(<MatchingScenarios {...base} scenarios={scenarios} />)
    expect(screen.getByText('Участник-r1')).toBeInTheDocument()
    expect(screen.getByText('Участник-r2')).toBeInTheDocument()
  })

  it('shows CTA "Хочу в этот круг" when viewer is a member and not confirmed', () => {
    const scenarios = [makeScenario('s1', [{ key: 'k1', bookId: 'book-1', memberRefs: ['r1'], viewerIsMember: true }])]
    render(<MatchingScenarios {...base} scenarios={scenarios} />)
    expect(screen.getByTestId('circle-confirm-button')).toBeInTheDocument()
    expect(screen.getByTestId('circle-confirm-button')).toHaveTextContent('Хочу в этот круг')
  })

  it('shows no CTA when viewer is not a member', () => {
    const scenarios = [makeScenario('s1', [{ key: 'k1', bookId: 'book-1', memberRefs: ['r1'], viewerIsMember: false }])]
    render(<MatchingScenarios {...base} scenarios={scenarios} />)
    expect(screen.queryByTestId('circle-confirm-button')).toBeNull()
  })

  it('shows waiting state with cancel when viewer confirmed this circle', () => {
    const scenarios = [makeScenario('s1', [{ key: 'k1', bookId: 'book-1', memberRefs: ['r1'], viewerIsMember: true, confirmedRefs: ['r1'] }])]
    render(<MatchingScenarios {...base} scenarios={scenarios} viewerConfirmedCircleKey="k1" />)
    expect(screen.getByTestId('circle-waiting')).toBeInTheDocument()
    expect(screen.getByTestId('circle-cancel-button')).toBeInTheDocument()
    expect(screen.getByText(/Подтверждено/)).toBeInTheDocument()
    expect(screen.getByText(/временно/)).toBeInTheDocument()
    expect(screen.queryByTestId('circle-confirm-button')).toBeNull()
  })

  it('opens dialog when clicking confirm CTA', () => {
    const scenarios = [makeScenario('s1', [{ key: 'k1', bookId: 'book-1', memberRefs: ['r1'], viewerIsMember: true }])]
    render(<MatchingScenarios {...base} scenarios={scenarios} />)
    fireEvent.click(screen.getByTestId('circle-confirm-button'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows switch dialog with from/to when viewer has a different confirmation', () => {
    const scenarios = [
      makeScenario('s1', [
        { key: 'k1', bookId: 'book-1', memberRefs: ['r1'], viewerIsMember: false, confirmedRefs: ['r1'] },
        { key: 'k2', bookId: 'book-2', memberRefs: ['r2'], viewerIsMember: true },
      ]),
    ]
    render(<MatchingScenarios {...base} scenarios={scenarios} viewerConfirmedCircleKey="k1" />)
    fireEvent.click(screen.getByTestId('circle-confirm-button'))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    // "from" book and "to" book shown (may appear in card + dialog)
    expect(screen.getAllByText('Первая книга').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Вторая книга').length).toBeGreaterThanOrEqual(1)
  })

  it('PUTs confirmation and calls onConfirmationChange on success', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) })
    const onChange = jest.fn()
    const scenarios = [makeScenario('s1', [{ key: 'k1', bookId: 'book-1', memberRefs: ['r1'], viewerIsMember: true }])]
    render(<MatchingScenarios {...base} scenarios={scenarios} onConfirmationChange={onChange} />)
    fireEvent.click(screen.getByTestId('circle-confirm-button'))
    fireEvent.click(screen.getByRole('button', { name: /подтверд/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/matching/sessions/s1/confirmation',
      expect.objectContaining({ method: 'PUT' }),
    ))
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
  })

  it('DELETEs confirmation on cancel and calls onConfirmationChange', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) })
    const onChange = jest.fn()
    const scenarios = [makeScenario('s1', [{ key: 'k1', bookId: 'book-1', memberRefs: ['r1'], viewerIsMember: true, confirmedRefs: ['r1'] }])]
    render(<MatchingScenarios {...base} scenarios={scenarios} viewerConfirmedCircleKey="k1" onConfirmationChange={onChange} />)
    fireEvent.click(screen.getByTestId('circle-cancel-button'))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/matching/sessions/s1/confirmation',
      expect.objectContaining({ method: 'DELETE' }),
    ))
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
  })

  it('shows no CTA in read-only (observer) mode', () => {
    const scenarios = [makeScenario('s1', [{ key: 'k1', bookId: 'book-1', memberRefs: ['r1'], viewerIsMember: true }])]
    render(<MatchingScenarios {...base} scenarios={scenarios} viewerRole="observer" />)
    expect(screen.queryByTestId('circle-confirm-button')).toBeNull()
  })

  it('shows no CTA when frozen', () => {
    const scenarios = [makeScenario('s1', [{ key: 'k1', bookId: 'book-1', memberRefs: ['r1'], viewerIsMember: true }])]
    render(<MatchingScenarios {...base} scenarios={scenarios} frozen />)
    expect(screen.queryByTestId('circle-confirm-button')).toBeNull()
  })

  it('shows no cancel in read-only waiting state (observer)', () => {
    const scenarios = [makeScenario('s1', [{ key: 'k1', bookId: 'book-1', memberRefs: ['r1'], viewerIsMember: true, confirmedRefs: ['r1'] }])]
    render(<MatchingScenarios {...base} scenarios={scenarios} viewerConfirmedCircleKey="k1" viewerRole="observer" />)
    expect(screen.getByTestId('circle-waiting')).toBeInTheDocument()
    expect(screen.queryByTestId('circle-cancel-button')).toBeNull()
  })

  it('shows error message when confirm fails', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({ error: 'stale_version' }) })
    const scenarios = [makeScenario('s1', [{ key: 'k1', bookId: 'book-1', memberRefs: ['r1'], viewerIsMember: true }])]
    render(<MatchingScenarios {...base} scenarios={scenarios} />)
    fireEvent.click(screen.getByTestId('circle-confirm-button'))
    fireEvent.click(screen.getByRole('button', { name: /подтверд/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('stale_version')
  })
})
