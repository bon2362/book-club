import { render, screen } from '@testing-library/react'
import MatchingScenarios from './MatchingScenarios'
import type { MatchingScenario, ScenarioSetOverview } from '@/lib/matching/scenarios'

jest.mock('./CoverImage', () => function MockCoverImage() {
  return <div data-testid="cover-image" />
})

const score = {
  coveredCount: 3,
  totalCount: 4,
  coverageRatio: 0.75,
  strongInterestCount: 1,
  rankedCount: 1,
  unrankedCount: 0,
  rankSum: 1,
  avgRank: 1,
  worstRank: 1,
}

function scenario(id: string, tier: MatchingScenario['tier'], leftOutUserIds: string[]): MatchingScenario {
  return {
    id,
    tier,
    circles: [{
      id: `${id}-circle`,
      bookId: 'book-1',
      members: [{ userId: 'user-1', pseudonym: 'Лиса', rank: 1, interest: 'очень хочу' }],
      minSize: 3,
      maxSize: 3,
      wantsCount: 1,
      avgRank: 1,
      worstRank: 1,
      unrankedCount: 0,
    }],
    leftOut: leftOutUserIds.map((userId) => ({ userId, pseudonym: userId === 'viewer' ? 'Пчела' : 'Кит' })),
    score,
  }
}

function renderScenarios(scenarios: MatchingScenario[]) {
  const overview: ScenarioSetOverview = {
    scenarios,
    leader: scenarios[0] ?? null,
    totalCount: 4,
    minGroupSize: 3,
    maxGroupSize: 3,
    mode: 'coverage',
  }

  render(
    <MatchingScenarios
      overview={overview}
      bookById={new Map([[
        'book-1',
        {
          id: 'book-1',
          bookId: 'book-1',
          title: 'Книга',
          author: 'Автор',
          description: 'Описание',
          coverUrl: null,
          pages: null,
          publishedDate: '',
          tags: [],
          textUrl: '',
          whyRead: null,
          recommendationLink: null,
        },
      ]])}
      bookParticipants={[]}
      viewingUserId="viewer"
    />,
  )
}

describe('MatchingScenarios', () => {
  it('marks only the leader scenario when the viewer is left out', () => {
    renderScenarios([
      scenario('leader', 'leader', []),
      scenario('alternative', 'full-coverage', ['viewer']),
    ])

    const alternative = screen.getByText('Сценарий 2').closest('li')

    expect(alternative).toHaveAttribute('data-viewer-left-out', 'false')
  })

  it('marks the leader scenario when the viewer is left out of the leader', () => {
    renderScenarios([
      scenario('leader', 'leader', ['viewer']),
      scenario('alternative', 'full-coverage', []),
    ])

    const leader = screen.getByText('Сценарий 1').closest('li')

    expect(leader).toHaveAttribute('data-viewer-left-out', 'true')
  })
})
