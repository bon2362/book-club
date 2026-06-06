import { render, screen } from '@testing-library/react'
import MatchingImpactWorkspace from './MatchingImpactWorkspace'
import type { ScenarioSetOverview } from '@/lib/matching/scenarios'

jest.mock('./MatchingScenarios', () => function MockMatchingScenarios() {
  return <div data-testid="matching-scenarios" />
})

jest.mock('./MatchingMyMoves', () => function MockMatchingMyMoves() {
  return <div data-testid="matching-my-moves" />
})

const overview: ScenarioSetOverview = {
  scenarios: [],
  leader: null,
  totalCount: 0,
  minGroupSize: 3,
  maxGroupSize: 3,
  mode: 'satisfaction',
}

describe('MatchingImpactWorkspace', () => {
  it('uses satisfaction copy for the scenarios panel', () => {
    render(
      <MatchingImpactWorkspace
        overview={overview}
        bookById={new Map()}
        bookParticipants={[]}
        viewingUserId="viewer"
        moves={[]}
        frozen={false}
        movesHeading="Мои ходы"
      />,
    )

    expect(screen.getByRole('heading', { name: 'Сценарии кругов' })).toBeInTheDocument()
    expect(screen.getByText('Добавляйте, убирайте книги и меняйте приоритеты, чтобы влиять на финальный расклад')).toBeInTheDocument()
  })
})
