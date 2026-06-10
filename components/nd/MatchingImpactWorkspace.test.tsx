import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MatchingImpactWorkspace from './MatchingImpactWorkspace'
import { MatchingBoardContext } from './MatchingBoardProvider'
import type { ScenarioSetOverview } from '@/lib/matching/scenarios'

jest.mock('./MatchingScenarios', () => function MockMatchingScenarios() {
  return <div data-testid="matching-scenarios" />
})

jest.mock('./MatchingMyMoves', () => function MockMatchingMyMoves() {
  return <div data-testid="matching-my-moves" />
})

const makeOverview = (leaderId: string | null): ScenarioSetOverview => ({
  scenarios: [],
  leader: leaderId ? ({ id: leaderId } as unknown as ScenarioSetOverview['leader']) : null,
  totalCount: 0,
  minGroupSize: 3,
  maxGroupSize: 3,
  mode: 'satisfaction',
})

const overview = makeOverview(null)

const baseProps = {
  sessionId: 's1',
  bookById: new Map(),
  bookParticipants: [],
  viewingUserId: 'viewer',
  moves: [],
  frozen: false,
  movesHeading: 'Мои ходы',
}

const adriftNever = { reason: 'never' as const, cause: null }

describe('MatchingImpactWorkspace', () => {
  it('uses satisfaction copy for the scenarios panel', () => {
    render(<MatchingImpactWorkspace {...baseProps} overview={overview} />)

    expect(screen.getByRole('heading', { name: 'Сценарии кругов' })).toBeInTheDocument()
    expect(screen.getByText('Добавляйте, убирайте книги и меняйте приоритеты, чтобы влиять на финальный расклад')).toBeInTheDocument()
  })
})

describe('MatchingImpactWorkspace — лоадер пересчёта (#315)', () => {
  it('не показывает лоадер, когда pending=false (дефолтный контекст)', () => {
    render(<MatchingImpactWorkspace {...baseProps} overview={overview} />)
    expect(screen.queryAllByTestId('matching-board-loader')).toHaveLength(0)
  })

  it('показывает оверлей-лоадер в обеих панелях, когда pending=true', () => {
    render(
      <MatchingBoardContext.Provider value={{ pending: true, beginPending: () => {}, endPending: () => {} }}>
        <MatchingImpactWorkspace {...baseProps} overview={overview} />
      </MatchingBoardContext.Provider>,
    )
    // по одному оверлею на «Сценарии кругов» и «Мои ходы»
    expect(screen.getAllByTestId('matching-board-loader')).toHaveLength(2)
  })
})

describe('MatchingImpactWorkspace — закрытие баннера «Вы пока не в круге» (#339)', () => {
  beforeEach(() => window.localStorage.clear())

  it('закрывает баннер по «Понятно», пишет localStorage и помнит после перемонтирования (≈ reload)', async () => {
    const props = { ...baseProps, overview: makeOverview('sc-1'), adrift: adriftNever }
    const { unmount } = render(<MatchingImpactWorkspace {...props} />)

    const dismiss = await screen.findByTestId('matching-adrift-dismiss')
    fireEvent.click(dismiss)

    expect(screen.queryByTestId('matching-adrift-banner')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('matching:adrift-dismissed:s1')).toBe('sc-1')

    unmount()
    render(<MatchingImpactWorkspace {...props} />)
    // банер остаётся скрытым — эффект монтирования прочитал localStorage
    await waitFor(() => {
      expect(screen.queryByTestId('matching-adrift-banner')).not.toBeInTheDocument()
    })
  })

  it('возвращает баннер, когда расклад изменился (новый лидер-сценарий)', async () => {
    window.localStorage.setItem('matching:adrift-dismissed:s1', 'sc-1')
    const props = { ...baseProps, overview: makeOverview('sc-2'), adrift: adriftNever }
    render(<MatchingImpactWorkspace {...props} />)

    // сигнатура изменилась (sc-1 → sc-2), закрытие больше не действует
    expect(await screen.findByTestId('matching-adrift-banner')).toBeInTheDocument()
  })

  it('забывает закрытие, когда пользователь снова в круге (adrift == null)', async () => {
    window.localStorage.setItem('matching:adrift-dismissed:s1', 'sc-1')
    const props = { ...baseProps, overview: makeOverview('sc-1'), adrift: null }
    render(<MatchingImpactWorkspace {...props} />)

    await waitFor(() => {
      expect(window.localStorage.getItem('matching:adrift-dismissed:s1')).toBeNull()
    })
  })
})
