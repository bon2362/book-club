import { finalizeMatchingMutationEffects } from '../mutation-effects'
import type { MatchingScenario } from '../scenarios'
import { fetchScenarioContextForSession } from '../scenario-input'
import { buildFeedEventsForMutation } from '../feed-events'
import { clearAdriftCause, rememberAdriftCausesFromEvents } from '../adrift'
import { recordMatchingPreferenceEvent } from '../preference-events'

jest.mock('../scenario-input', () => ({
  fetchScenarioContextForSession: jest.fn(),
}))
jest.mock('../feed-events', () => ({
  buildFeedEventsForMutation: jest.fn(),
}))
jest.mock('../adrift', () => ({
  clearAdriftCause: jest.fn(),
  rememberAdriftCausesFromEvents: jest.fn(),
}))
jest.mock('../preference-events', () => ({
  recordMatchingPreferenceEvent: jest.fn(),
}))

const mockFetchContext = fetchScenarioContextForSession as jest.Mock
const mockBuildFeedEvents = buildFeedEventsForMutation as jest.Mock
const mockClearAdrift = clearAdriftCause as jest.Mock
const mockRememberAdrift = rememberAdriftCausesFromEvents as jest.Mock
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
    mockBuildFeedEvents.mockReturnValue([
      {
        type: 'leftout',
        actor: { userId: 'actor', pseudonym: 'Лиса' },
        affected: { userId: 'target', pseudonym: 'Белка' },
        bookId: 'book-1',
      },
    ])
    mockRecordEvent.mockResolvedValue(undefined)
  })

  it('derives feed events, updates adrift state, and records persistent analytics', async () => {
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

    expect(mockBuildFeedEvents).toHaveBeenCalledWith(expect.objectContaining({
      actor: { userId: 'actor', pseudonym: 'Лиса' },
      bookId: 'book-1',
      kind: 'book_added',
      leaderBefore: beforeLeader,
      leaderAfter: afterLeader,
    }))
    expect(mockRememberAdrift).toHaveBeenCalledWith('session-1', [expect.objectContaining({ type: 'leftout' })])
    expect(mockClearAdrift).toHaveBeenCalledWith('session-1', 'actor')
    expect(mockClearAdrift).toHaveBeenCalledWith('session-1', 'target')
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

    expect(mockBuildFeedEvents).not.toHaveBeenCalled()
    expect(mockRecordEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'admin',
      eventType: 'priorities_updated',
      source: 'admin',
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
