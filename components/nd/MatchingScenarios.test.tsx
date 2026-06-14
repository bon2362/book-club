import { render, screen } from '@testing-library/react'
import MatchingScenarios from './MatchingScenarios'
import type { MatchingScenario, ScenarioSetOverview } from '@/lib/matching/scenarios'
import type { MyMoveBook } from '@/lib/matching/my-moves'
import type { MatchingBookDetail } from './MatchingBookDetailModal'

type BookInfo = MatchingBookDetail & { id: string }

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

function makeCircle(bookId: string, circleId: string) {
  return {
    id: circleId,
    bookId,
    members: [{ userId: 'user-1', pseudonym: 'Лиса', rank: 1, interest: 'очень хочу' as const }],
    minSize: 3,
    maxSize: 3,
    wantsCount: 1,
    avgRank: 1,
    worstRank: 1,
    unrankedCount: 0,
  }
}

function scenario(id: string, tier: MatchingScenario['tier'], leftOutUserIds: string[], extraBookIds: string[] = []): MatchingScenario {
  return {
    id,
    tier,
    circles: [
      makeCircle('book-1', `${id}-circle`),
      ...extraBookIds.map((bookId, i) => makeCircle(bookId, `${id}-circle-${i + 2}`)),
    ],
    leftOut: leftOutUserIds.map((userId) => ({ userId, pseudonym: userId === 'viewer' ? 'Пчела' : 'Кит' })),
    score,
  }
}

function renderScenarios(
  scenarios: MatchingScenario[],
  options: { mode?: ScenarioSetOverview['mode']; previewMove?: MyMoveBook; previewOpen?: boolean } = {},
) {
  const overview: ScenarioSetOverview = {
    scenarios,
    leader: scenarios[0] ?? null,
    totalCount: 4,
    minGroupSize: 3,
    maxGroupSize: 3,
    mode: options.mode ?? 'coverage',
  }

  const bookEntry = (bookId: string, title: string): [string, BookInfo] => [bookId, {
    id: bookId,
    bookId,
    title,
    author: 'Автор',
    description: 'Описание',
    coverUrl: null,
    pages: null,
    publishedDate: '',
    tags: [],
    textUrl: '',
    whyRead: null,
    recommendationLink: null,
  }]

  render(
    <MatchingScenarios
      overview={overview}
      bookById={new Map([bookEntry('book-1', 'Книга'), bookEntry('book-2', 'Вторая книга')])}
      bookParticipants={[]}
      viewingUserId="viewer"
      previewMove={options.previewMove}
      previewOpen={options.previewOpen}
      mode={options.mode}
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

  it('shows circle counter with correct pluralization in scenario header', () => {
    renderScenarios([
      scenario('leader', 'leader', [], ['book-2']),
      scenario('alt', 'full-coverage', []),
    ])

    expect(screen.getByText('2 круга')).toBeInTheDocument()
    expect(screen.getByText('1 круг')).toBeInTheDocument()
  })

  it('shows "круг" label above members in every book row', () => {
    renderScenarios([
      scenario('leader', 'leader', [], ['book-2']),
    ])

    const labels = screen.getAllByText('круг')
    expect(labels.length).toBeGreaterThanOrEqual(2)
  })

  it('uses satisfaction copy for scenario cards and preview cards', () => {
    const previewScenario = scenario('preview', 'leader', [])
    const previewMove = {
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
      existingParticipants: [],
      impact: {
        scenarioId: previewScenario.id,
        scenarioTitle: 'preview',
        coverageLabel: '',
        summary: '',
        circleTitles: [],
        circleBooks: [],
        previewScenario,
        formsNewCircle: true,
        coverage: { before: 3, after: 4 },
        strongInterest: { before: 1, after: 2 },
        beneficiaries: [],
      },
    } satisfies MyMoveBook

    renderScenarios([scenario('leader', 'leader', ['viewer'])], {
      mode: 'satisfaction',
      previewMove,
      previewOpen: true,
    })

    expect(screen.getByText('↑ Добавится новый расклад')).toBeInTheDocument()
    expect(screen.getByText('+1 сценарий')).toBeInTheDocument()
    expect(screen.getByText('За бортом остаются:')).toBeInTheDocument()
    expect(screen.queryByText(/средний ранг/i)).not.toBeInTheDocument()
  })
})
