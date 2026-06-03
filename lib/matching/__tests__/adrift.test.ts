// Mock the DB module so the import chain doesn't require real env vars.
// All tests pass their own dbClient via the third parameter.
jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('@/lib/db/schema', () => ({
  matchingPreferenceEvents: {},
  matchingSessionParticipants: {},
}))

import { fetchAdriftCauseForUser, isViewerAdrift } from '../adrift'
import type { ScenarioSetOverview } from '../scenarios'

// Minimal Drizzle mock: returns the provided arrays in sequence on each .limit() call
function makeDb(...results: unknown[][]): Parameters<typeof fetchAdriftCauseForUser>[2] {
  let call = 0
  const chain = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockImplementation(() => Promise.resolve(results[call++] ?? [])),
  }
  return chain as never
}

function makeScenario(leftOutIds: string[]): object {
  return {
    id: 'scenario-' + leftOutIds.join('-'),
    leftOut: leftOutIds.map((id) => ({ userId: id, pseudonym: id.toUpperCase() })),
  }
}

const CAUSE_EVENT = {
  actorUserId: 'actor-1',
  eventType: 'book_removed',
  bookId: 'book-a',
  before: makeScenario([]),         // user-a NOT in leftOut before
  after:  makeScenario(['user-a']), // user-a IN leftOut after → this is the cause
  occurredAt: new Date('2026-01-02T10:00:00Z'),
}

const PARTICIPANT_ROW = [{ pseudonym: 'Лиса' }]

describe('fetchAdriftCauseForUser', () => {
  it('returns null when there are no events', async () => {
    const result = await fetchAdriftCauseForUser('s1', 'user-a', makeDb([]))
    expect(result).toBeNull()
  })

  it('returns the cause event where user first appeared in leftOut', async () => {
    const result = await fetchAdriftCauseForUser('s1', 'user-a', makeDb(
      [CAUSE_EVENT],    // 1st query: events
      PARTICIPANT_ROW,  // 2nd query: participant lookup
    ))

    expect(result).toMatchObject({
      actor: { userId: 'actor-1', pseudonym: 'Лиса' },
      bookId: 'book-a',
      mutationKind: 'book_removed',
      at: new Date('2026-01-02T10:00:00Z').getTime(),
    })
  })

  it('picks the most recent cause when user went adrift more than once', async () => {
    const olderCause = {
      ...CAUSE_EVENT,
      bookId: 'book-old',
      occurredAt: new Date('2026-01-01T00:00:00Z'),
    }
    // Rows come newest-first; first match is the most recent transition into leftOut
    const result = await fetchAdriftCauseForUser('s1', 'user-a', makeDb(
      [CAUSE_EVENT, olderCause],
      PARTICIPANT_ROW,
    ))

    expect(result?.bookId).toBe('book-a') // not book-old
  })

  it('skips events where user was already in leftOut (continuous adrift)', async () => {
    const alreadyAdrift = {
      ...CAUSE_EVENT,
      bookId: 'neutral-event',
      before: makeScenario(['user-a']), // already leftOut before
      after:  makeScenario(['user-a']), // still leftOut after
      occurredAt: new Date('2026-01-03T00:00:00Z'),
    }
    // alreadyAdrift is newer but should be skipped; CAUSE_EVENT is the real trigger
    const result = await fetchAdriftCauseForUser('s1', 'user-a', makeDb(
      [alreadyAdrift, CAUSE_EVENT],
      PARTICIPANT_ROW,
    ))

    expect(result?.bookId).toBe('book-a')
  })

  it('falls back to pseudonym "Участник" when actor has left the session', async () => {
    const result = await fetchAdriftCauseForUser('s1', 'user-a', makeDb(
      [CAUSE_EVENT],
      [], // participant not found
    ))

    expect(result?.actor.pseudonym).toBe('Участник')
  })

  it('returns null when event type is not a known mutation kind', async () => {
    const unknownKindEvent = { ...CAUSE_EVENT, eventType: 'unknown_kind' }
    const result = await fetchAdriftCauseForUser('s1', 'user-a', makeDb(
      [unknownKindEvent],
    ))

    expect(result).toBeNull()
  })
})

describe('isViewerAdrift', () => {
  const overview = (leftOutIds: string[]): ScenarioSetOverview => ({
    scenarios: [],
    leader: {
      id: 'l',
      tier: 'leader',
      circles: [],
      leftOut: leftOutIds.map((id) => ({ userId: id, pseudonym: id })),
      score: { coveredCount: 0, totalCount: 0, coverageRatio: 0, strongInterestCount: 0, rankedCount: 0, unrankedCount: 0, rankSum: 0, avgRank: null, worstRank: null },
    },
    totalCount: 1,
    minGroupSize: 2,
    maxGroupSize: 3,
  })

  it('returns true when viewer is in leader leftOut', () => {
    expect(isViewerAdrift(overview(['u1', 'u2']), 'u1')).toBe(true)
  })

  it('returns false when viewer is not in leader leftOut', () => {
    expect(isViewerAdrift(overview(['u2']), 'u1')).toBe(false)
  })

  it('returns false when there is no leader', () => {
    const noLeader: ScenarioSetOverview = { scenarios: [], leader: null, totalCount: 0, minGroupSize: 2, maxGroupSize: 3 }
    expect(isViewerAdrift(noLeader, 'u1')).toBe(false)
  })
})
