import {
  publicizeMyMoves,
  publicizeScenario,
  publicizeScenarioOverview,
  publicizeScenarioSetOverview,
} from '../public-state'
import type { MatchingScenario, ScenarioOverview, ScenarioSetOverview } from '../scenarios'
import type { MyMoveBook } from '../my-moves'

const ids = new Map([
  ['user-uuid-1', 'Пчела'],
  ['user-uuid-2', 'Мальма'],
  ['user-uuid-3', 'Чеглок'],
])

const scenario: MatchingScenario = {
  id: 'book-a:user-uuid-1+user-uuid-2',
  tier: 'leader',
  circles: [{
    id: 'book-a:user-uuid-1+user-uuid-2',
    bookId: 'book-a',
    members: [
      { userId: 'user-uuid-1', pseudonym: 'Пчела', rank: 1, interest: 'очень хочу' },
      { userId: 'user-uuid-2', pseudonym: 'Мальма', rank: null, interest: 'без ранга' },
    ],
    minSize: 2,
    maxSize: 3,
    wantsCount: 1,
    avgRank: 1,
    worstRank: 1,
    unrankedCount: 1,
  }],
  leftOut: [{ userId: 'user-uuid-3', pseudonym: 'Чеглок' }],
  score: {
    coveredCount: 2,
    totalCount: 3,
    coverageRatio: 2 / 3,
    strongInterestCount: 1,
    rankedCount: 1,
    unrankedCount: 1,
    rankSum: 1,
    avgRank: 1,
    worstRank: 1,
  },
}

describe('public matching state sanitizers', () => {
  it('replaces internal ids in scenarios and regenerates stable public scenario ids', () => {
    const result = publicizeScenario(scenario, ids)

    expect(result.id).toBe('scenario-1')
    expect(result.circles[0].id).toBe('book-a:circle-1')
    expect(result.circles[0].members.map((member) => member.userId)).toEqual(['Пчела', 'Мальма'])
    expect(result.leftOut).toEqual([{ userId: 'Чеглок', pseudonym: 'Чеглок' }])
    expect(JSON.stringify(result)).not.toContain('user-uuid')
  })

  it('falls back to the participant pseudonym when an id is missing from the public map', () => {
    const result = publicizeScenario(scenario, new Map())

    expect(result.circles[0].members.map((member) => member.userId)).toEqual(['Пчела', 'Мальма'])
    expect(result.leftOut).toEqual([{ userId: 'Чеглок', pseudonym: 'Чеглок' }])
    expect(JSON.stringify(result)).not.toContain('user-uuid')
  })

  it('sanitizes scenario overview cards, candidates and conflicts', () => {
    const overview: ScenarioOverview = {
      current: [{
        bookId: 'book-a',
        tier: 'leader',
        members: scenario.circles[0].members,
        wantsCount: 1,
        avgRank: 1,
        worstRank: 1,
        unrankedCount: 1,
      }],
      candidates: [{
        bookId: 'book-b',
        tier: 'sub-max',
        members: scenario.circles[0].members,
        wantsCount: 1,
        avgRank: 1,
        worstRank: 1,
        unrankedCount: 1,
        inCurrentLayout: false,
        conflictsWith: ['book-a:user-uuid-1+user-uuid-2'],
      }],
      leftOut: scenario.leftOut,
      coveredCount: 2,
      totalCount: 3,
      minGroupSize: 2,
      maxGroupSize: 3,
      mode: 'coverage',
    }

    const result = publicizeScenarioOverview(overview, ids)

    expect(result.current[0].members[0].userId).toBe('Пчела')
    expect(result.candidates[0].members[1].userId).toBe('Мальма')
    expect(result.candidates[0].conflictsWith).toEqual([])
    expect(JSON.stringify(result)).not.toContain('user-uuid')
  })

  it('sanitizes scenario sets and keeps the public leader aligned with its index', () => {
    const secondScenario: MatchingScenario = {
      ...scenario,
      id: 'book-c:user-uuid-2+user-uuid-3',
      circles: [{ ...scenario.circles[0], bookId: 'book-c', id: 'book-c:user-uuid-2+user-uuid-3' }],
    }
    const overview: ScenarioSetOverview = {
      scenarios: [scenario, secondScenario],
      leader: secondScenario,
      totalCount: 3,
      minGroupSize: 2,
      maxGroupSize: 3,
      mode: 'coverage',
    }

    const result = publicizeScenarioSetOverview(overview, ids)

    expect(result.scenarios.map((item) => item.id)).toEqual(['scenario-1', 'scenario-2'])
    expect(result.leader?.id).toBe('scenario-2')
    expect(JSON.stringify(result)).not.toContain('user-uuid')
  })

  it('sanitizes my-moves participant ids and simulated impact ids', () => {
    const moves: MyMoveBook[] = [{
      bookId: 'book-a',
      title: 'Book',
      author: 'Author',
      description: '',
      coverUrl: null,
      pages: null,
      publishedDate: '',
      textUrl: '',
      whyRead: null,
      recommendationLink: null,
      tags: [],
      existingParticipants: [{ userId: 'user-uuid-1', pseudonym: 'Пчела', rank: 1 }],
      impact: {
        scenarioId: 'book-a:user-uuid-1+user-uuid-2',
        scenarioTitle: 'scenario',
        coverageLabel: '2 из 3',
        summary: 'summary',
        circleTitles: ['Book'],
        circleBooks: [{ bookId: 'book-a', title: 'Book' }],
        previewScenario: scenario,
        formsNewCircle: true,
        coverage: { before: 1, after: 2 },
        strongInterest: { before: 0, after: 1 },
        beneficiaries: [{
          userId: 'user-uuid-2',
          pseudonym: 'Мальма',
          before: { place: 'leftOut' },
          after: 'очень хочу',
          afterRank: null,
        }],
      },
    }]

    const result = publicizeMyMoves(moves, ids)

    expect(result[0].existingParticipants[0].userId).toBe('Пчела')
    expect(result[0].impact?.scenarioId).toBe('scenario-preview')
    expect(result[0].impact?.beneficiaries[0].userId).toBe('Мальма')
    expect(JSON.stringify(result)).not.toContain('user-uuid')
  })
})
