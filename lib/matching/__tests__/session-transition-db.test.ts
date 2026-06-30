import { fetchRankedMatchingScenarios, toRankedReconciliationScenarios } from '../session-transition-db'
import { fetchMatchingScenarioOverview } from '../scenario-overview-db'
import type { MatchingScenario } from '../scenarios'

jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('../scenario-overview-db', () => ({ fetchMatchingScenarioOverview: jest.fn() }))

function scenario(id: string, members: string[]): MatchingScenario {
  return {
    id,
    tier: 'partial',
    circles: [{
      id: `${id}-circle`,
      bookId: 'book-1',
      members: members.map((userId) => ({
        userId,
        displayName: userId,
        rank: 1,
        interest: 'очень хочу',
      })),
      minSize: 3,
      maxSize: 3,
      wantsCount: members.length,
      avgRank: 1,
      worstRank: 1,
      unrankedCount: 0,
    }],
    leftOut: [],
    score: {
      coveredCount: members.length,
      totalCount: members.length,
      strongInterestCount: members.length,
      rankedCount: members.length,
      unrankedCount: 0,
      rankSum: members.length,
      avgRank: 1,
      worstRank: 1,
    },
  }
}

describe('toRankedReconciliationScenarios', () => {
  it('keeps scenario rank while replacing internal circle ids with opaque exact-circle keys', () => {
    const result = toRankedReconciliationScenarios('session-secret', [
      scenario('scenario-1', ['u2', 'u1', 'u3']),
      scenario('scenario-2', ['u1', 'u2', 'u3']),
    ])

    expect(result).toHaveLength(2)
    expect(result[0].circles[0].memberUserIds).toEqual(['u1', 'u2', 'u3'])
    expect(result[0].circles[0].circleKey).toBe(result[1].circles[0].circleKey)
    expect(result[0].circles[0].circleKey).not.toContain('u1')
  })
})

it('derives the minimal reconciliation model from the full overview read model', async () => {
  const overview = { scenarios: [scenario('presentation-scenario', ['u1', 'u2', 'u3'])], leader: null, totalCount: 3, minGroupSize: 3, maxGroupSize: 3 }
  ;(fetchMatchingScenarioOverview as jest.Mock).mockResolvedValue(overview)

  const result = await fetchRankedMatchingScenarios('session-secret', {} as never)

  expect(fetchMatchingScenarioOverview).toHaveBeenCalledWith('session-secret', {})
  expect(result[0]).toEqual({ circles: [{
    circleKey: expect.any(String), bookId: 'book-1', memberUserIds: ['u1', 'u2', 'u3'],
  }] })
  expect(result[0]).not.toHaveProperty('score')
  expect(result[0]).not.toHaveProperty('leftOut')
})
