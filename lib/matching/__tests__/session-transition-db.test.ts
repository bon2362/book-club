import { fetchRankedMatchingScenarios, toRankedReconciliationScenarios } from '../reconciliation-scenarios-db'
import { fetchMatchingScenarioInput } from '../scenario-input-db'
import type { MatchingScenario } from '../scenarios'
import fs from 'fs'
import path from 'path'

jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('../scenario-input-db', () => ({ fetchMatchingScenarioInput: jest.fn() }))

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

it('returns only the minimal reconciliation model across the transition boundary', async () => {
  ;(fetchMatchingScenarioInput as jest.Mock).mockResolvedValue({
    participants: ['u1', 'u2', 'u3'].map((userId) => ({ userId, displayName: userId })),
    books: [{ bookId: 'book-1' }],
    signups: ['u1', 'u2', 'u3'].map((userId) => ({ userId, bookId: 'book-1' })),
    ranks: ['u1', 'u2', 'u3'].map((userId) => ({ userId, bookId: 'book-1', rank: 1 })),
    minGroupSize: 3,
    maxGroupSize: 3,
  })

  const result = await fetchRankedMatchingScenarios('session-secret', {} as never)

  expect(fetchMatchingScenarioInput).toHaveBeenCalledWith('session-secret', {})
  expect(result[0]).toEqual({ circles: [{
    circleKey: expect.any(String), bookId: 'book-1', memberUserIds: ['u1', 'u2', 'u3'],
  }] })
  expect(result[0]).not.toHaveProperty('score')
  expect(result[0]).not.toHaveProperty('leftOut')
})

it('does not couple the transition store to the full presentation overview reader', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'lib/matching/session-transition-db.ts'), 'utf8')
  expect(source).not.toContain("from './scenario-overview-db'")
  expect(source).not.toContain('fetchMatchingScenarioOverview')
})
