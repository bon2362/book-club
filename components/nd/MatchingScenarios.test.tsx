import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MatchingScenarios, { type PublicScenario } from './MatchingScenarios'

const openBook = jest.fn()
jest.mock('./BookDetailProvider', () => ({
  useBookDetail: () => ({ openBook }),
}))

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
    score: { coveredCount: 0, totalCount: 0, avgRank: null, worstRank: null },
    leftOut: [],
    circles: circles.map((c) => ({
      circleKey: c.key,
      bookId: c.bookId,
      members: c.memberRefs.map((ref) => ({
        ref,
        displayName: `Участник-${ref}`,
        rank: null,
        interest: 'без ранга' as const,
        confirmed: (c.confirmedRefs ?? []).includes(ref),
      })),
      avgRank: null,
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
  booksById: {
    'book-1': { bookId: 'book-1', title: 'Первая книга', author: 'Автор один', coverUrl: '/one.jpg', description: 'Описание', pages: 120, publishedDate: '2025', textUrl: '', whyRead: null, recommendationLink: null, tags: [] },
    'book-2': { bookId: 'book-2', title: 'Вторая книга', author: 'Автор два', coverUrl: null, description: '', pages: null, publishedDate: '', textUrl: '', whyRead: null, recommendationLink: null, tags: [] },
  },
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

  it('surfaces scenario metrics and left-out in a tooltip, and content without inline clutter', () => {
    const scenario = makeScenario('s1', [{ key: 'k1', bookId: 'book-1', memberRefs: ['r1', 'r2'] }])
    scenario.score = { coveredCount: 2, totalCount: 3, avgRank: 1.5, worstRank: 2 }
    scenario.leftOut = [{ ref: 'r3', displayName: 'Вера' }]
    scenario.circles[0].avgRank = 1.5
    scenario.circles[0].members[0] = { ...scenario.circles[0].members[0], displayName: 'Анна', rank: 1, interest: 'очень хочу' }
    render(<MatchingScenarios {...base} scenarios={[scenario]} />)
    // metrics + left-out live in the tooltip on «Сценарий N», not inline
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('средний ранг 1.5')
    expect(tip).toHaveTextContent('охват 2 из 3')
    expect(tip).toHaveTextContent('за бортом: Вера')
    // content still present
    expect(screen.getByAltText('Обложка: Первая книга')).toBeVisible()
    expect(screen.getByText('Автор один')).toBeVisible()
    // participant tooltip: place only, no duplicated «ранг» wording
    const chipTitle = screen.getByText('Анна').closest('.nd-chip-text')?.getAttribute('title') ?? ''
    expect(chipTitle).toContain('на 1 месте')
    expect(chipTitle).not.toContain('ранг')
    // no empty ○ glyph for unconfirmed members — only ✓ for confirmed
    expect(screen.queryByLabelText('Анна: не подтвердил')).toBeNull()
    expect(screen.queryByText('○')).toBeNull()
    expect(screen.queryByText(/лучший|оптимальный/i)).toBeNull()
  })

  it('opens the shared book popup from title and cover', () => {
    const scenarios = [makeScenario('s1', [{ key: 'k1', bookId: 'book-1', memberRefs: ['r1'] }])]
    render(<MatchingScenarios {...base} scenarios={scenarios} />)
    fireEvent.click(screen.getByRole('button', { name: 'Первая книга' }))
    expect(openBook).toHaveBeenCalledWith(expect.objectContaining({ bookId: 'book-1', author: 'Автор один' }), expect.any(Array))
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
    expect(screen.getByText(/Вы выбрали этот круг/)).toBeInTheDocument()
    expect(screen.getByText(/временно/)).toBeInTheDocument()
    expect(screen.queryByTestId('circle-confirm-button')).toBeNull()
  })

  it('confirms immediately (no dialog) when clicking confirm CTA', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) })
    const scenarios = [makeScenario('s1', [{ key: 'k1', bookId: 'book-1', memberRefs: ['r1'], viewerIsMember: true }])]
    render(<MatchingScenarios {...base} scenarios={scenarios} />)
    fireEvent.click(screen.getByTestId('circle-confirm-button'))
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/matching/sessions/s1/confirmation',
      expect.objectContaining({ method: 'PUT' }),
    ))
  })

  it('hides the confirm CTA on other circles once the viewer has confirmed one (no double-join)', () => {
    const scenarios = [
      makeScenario('s1', [
        { key: 'k1', bookId: 'book-1', memberRefs: ['r1'], viewerIsMember: true, confirmedRefs: ['r1'] },
        { key: 'k2', bookId: 'book-2', memberRefs: ['r1'], viewerIsMember: true },
      ]),
    ]
    render(<MatchingScenarios {...base} scenarios={scenarios} viewerConfirmedCircleKey="k1" />)
    // the confirmed circle shows waiting/cancel; the other member-circle offers no "join" CTA
    expect(screen.getByTestId('circle-waiting')).toBeInTheDocument()
    expect(screen.queryByTestId('circle-confirm-button')).toBeNull()
  })

  it('PUTs confirmation and calls onConfirmationChange on success', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) })
    const onChange = jest.fn()
    const scenarios = [makeScenario('s1', [{ key: 'k1', bookId: 'book-1', memberRefs: ['r1'], viewerIsMember: true }])]
    render(<MatchingScenarios {...base} scenarios={scenarios} onConfirmationChange={onChange} />)
    fireEvent.click(screen.getByTestId('circle-confirm-button'))
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
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('stale_version')
  })

  it('keeps the CTA visible and shows feedback when the network request rejects', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValue(new Error('offline'))
    const scenarios = [makeScenario('s1', [{ key: 'k1', bookId: 'book-1', memberRefs: ['r1'], viewerIsMember: true }])]
    render(<MatchingScenarios {...base} scenarios={scenarios} />)
    fireEvent.click(screen.getByTestId('circle-confirm-button'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Проверьте соединение'))
    expect(screen.getByTestId('circle-confirm-button')).toBeInTheDocument()
  })

  it('disables the confirm CTA in flight and prevents concurrent submits', async () => {
    let resolve!: (value: unknown) => void
    ;(global.fetch as jest.Mock).mockImplementation(() => new Promise((done) => { resolve = done }))
    const scenarios = [makeScenario('s1', [{ key: 'k1', bookId: 'book-1', memberRefs: ['r1'], viewerIsMember: true }])]
    render(<MatchingScenarios {...base} scenarios={scenarios} />)
    fireEvent.click(screen.getByTestId('circle-confirm-button'))
    expect(screen.getByTestId('circle-confirm-button')).toBeDisabled()
    fireEvent.click(screen.getByTestId('circle-confirm-button'))
    expect(global.fetch).toHaveBeenCalledTimes(1)
    resolve({ ok: true, json: async () => ({}) })
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
  })
})
