import { finalizeMatchingMutationEffects } from '../mutation-effects'
import type { MatchingScenario } from '../scenarios'
import { fetchScenarioContextForSession } from '../scenario-input'
import { recordMatchingPreferenceEvent } from '../preference-events'

jest.mock('../scenario-input', () => ({
  fetchScenarioContextForSession: jest.fn(),
}))
jest.mock('../preference-events', () => ({
  recordMatchingPreferenceEvent: jest.fn(),
}))

const mockFetchContext = fetchScenarioContextForSession as jest.Mock
const mockRecordEvent = recordMatchingPreferenceEvent as jest.Mock

function scenario(id: string, coveredCount: number, leftOut: MatchingScenario['leftOut']): MatchingScenario {
  return {
    id,
    tier: 'leader',
    circles: [],
    leftOut,
    score: {
      coveredCount,
      totalCount: 3,
      coverageRatio: coveredCount / 3,
      strongInterestCount: coveredCount,
      rankedCount: coveredCount,
      unrankedCount: 0,
      rankSum: coveredCount,
      avgRank: 1,
      worstRank: 1,
    },
  }
}

const beforeLeader = scenario('before', 2, [{ userId: 'target', pseudonym: 'Белка' }])
const afterLeader = scenario('after', 3, [])

const afterContext = {
  participants: [
    { userId: 'actor', pseudonym: 'Лиса' },
    { userId: 'target', pseudonym: 'Белка' },
  ],
  overview: {
    scenarios: [afterLeader],
    leader: afterLeader,
    totalCount: 1,
    minGroupSize: 3,
    maxGroupSize: 3,
    mode: 'coverage' as const,
  },
  bookTitleById: new Map([['book-1', 'Книга']]),
}

function contextWithLeader(leader: MatchingScenario) {
  return {
    ...afterContext,
    overview: {
      ...afterContext.overview,
      scenarios: [leader],
      leader,
    },
  }
}

describe('finalizeMatchingMutationEffects', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetchContext.mockResolvedValue(afterContext)
    mockRecordEvent.mockResolvedValue(undefined)
  })

  it('records persistent analytics for a mutation', async () => {
    await finalizeMatchingMutationEffects({
      sessionId: 'session-1',
      targetUserId: 'target',
      actorUserId: 'actor',
      bookId: 'book-1',
      kind: 'book_added',
      source: 'matching',
      before: { context: contextWithLeader(beforeLeader) },
      metadata: { via: 'test' },
    })

    expect(mockRecordEvent).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      userId: 'target',
      actorUserId: 'actor',
      eventType: 'book_added',
      source: 'matching',
      bookId: 'book-1',
      before: beforeLeader,
      after: afterLeader,
      metadata: { via: 'test', bookTitle: 'Книга' },
    }))
  })

  it('records admin analytics even when the actor is not a matching participant', async () => {
    await finalizeMatchingMutationEffects({
      sessionId: 'session-1',
      targetUserId: 'target',
      actorUserId: 'admin',
      bookId: null,
      kind: 'priorities_updated',
      source: 'admin',
      before: { context: contextWithLeader(beforeLeader) },
    })

    expect(mockRecordEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'admin',
      eventType: 'priorities_updated',
      source: 'admin',
    }))
  })

  it('обогащает id-массивы метаданных названиями книг (catalog delta)', async () => {
    mockFetchContext.mockResolvedValue({
      ...afterContext,
      bookTitleById: new Map([
        ['book-1', 'Дюна'],
        ['book-2', '1984'],
      ]),
    })

    await finalizeMatchingMutationEffects({
      sessionId: 'session-1',
      targetUserId: 'target',
      actorUserId: 'target',
      bookId: null,
      kind: 'catalog_signup_updated',
      source: 'catalog',
      before: null,
      metadata: { addedBookIds: ['book-1'], removedBookIds: ['book-2'] },
    })

    expect(mockRecordEvent).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        addedBookIds: ['book-1'],
        removedBookIds: ['book-2'],
        addedBookTitles: ['Дюна'],
        removedBookTitles: ['1984'],
        bookTitle: null,
      }),
    }))
  })

  it('обогащает rankedBookIds, неизвестный id остаётся как есть', async () => {
    mockFetchContext.mockResolvedValue({
      ...afterContext,
      bookTitleById: new Map([['book-1', 'Дюна']]),
    })

    await finalizeMatchingMutationEffects({
      sessionId: 'session-1',
      targetUserId: 'target',
      actorUserId: 'target',
      bookId: null,
      kind: 'priorities_updated',
      source: 'profile',
      before: null,
      metadata: { rankedBookIds: ['book-1', 'book-missing'] },
    })

    expect(mockRecordEvent).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        rankedBookTitles: ['Дюна', 'book-missing'],
      }),
    }))
  })

  it('does nothing when the scenario context is unavailable', async () => {
    mockFetchContext.mockResolvedValue(null)

    await finalizeMatchingMutationEffects({
      sessionId: 'session-1',
      targetUserId: 'target',
      actorUserId: 'actor',
      bookId: 'book-1',
      kind: 'book_added',
      source: 'matching',
      before: null,
    })

    expect(mockRecordEvent).not.toHaveBeenCalled()
  })
})
