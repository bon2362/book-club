import type { MatchingScenario, ScenarioParticipant } from './scenarios'

export type MatchingMutationKind =
  | 'book_added'
  | 'book_removed'
  | 'rank_changed'
  | 'status_changed'
  | 'catalog_signup_updated'
  | 'priorities_updated'
  | 'participant_left'

export interface MatchingMutationActor {
  userId: string
  pseudonym: string
}

export interface ActorBookMutation {
  actor: MatchingMutationActor
  bookId: string
  kind: MatchingMutationKind
}

export interface FeedScenarioSummary {
  scenarioId: string
  coveredCount: number
  totalCount: number
  strongInterestCount: number
  circleBookIds: string[]
  leftOutUserIds: string[]
}

export interface FeedEventBaseDraft {
  actor: MatchingMutationActor
  bookId: string
  mutationKind: MatchingMutationKind
}

export interface BestFeedEventDraft extends FeedEventBaseDraft {
  type: 'best'
  /** true — лидер-сценарий улучшился; false — изменился без улучшения (регрессия/перестановка). */
  improved: boolean
  before: FeedScenarioSummary | null
  after: FeedScenarioSummary | null
  addedCircleBookIds: string[]
  removedCircleBookIds: string[]
}

export interface LeftoutFeedEventDraft extends FeedEventBaseDraft {
  type: 'leftout'
  affected: ScenarioParticipant
  cause: AdriftCause
}

export type FeedEventDraft = BestFeedEventDraft | LeftoutFeedEventDraft

export interface AdriftCause {
  actor: MatchingMutationActor
  bookId: string
  mutationKind: MatchingMutationKind
  leaderBeforeId: string | null
  leaderAfterId: string | null
  at: number
}

export interface BuildFeedEventsInput extends ActorBookMutation {
  leaderBefore: MatchingScenario | null
  leaderAfter: MatchingScenario | null
  now?: number
}

export function buildFeedEventsForMutation(input: BuildFeedEventsInput): FeedEventDraft[] {
  const events: FeedEventDraft[] = []
  const mutation = pickMutation(input)
  const leftOut = newlyLeftOut(input.leaderBefore, input.leaderAfter)
  const improved = hasLeaderImproved(input.leaderBefore, input.leaderAfter)

  // Показываем «расклад изменился» при любом значимом изменении лидера —
  // и улучшении, и регрессии. Исключение: чистую регрессию, которую уже
  // описывает более конкретное событие «выпал из круга», не дублируем.
  if (hasLeaderChanged(input.leaderBefore, input.leaderAfter) && (improved || leftOut.length === 0)) {
    events.push(buildBestEvent(mutation, input.leaderBefore, input.leaderAfter, improved))
  }

  for (const affected of leftOut) {
    events.push({
      ...mutation,
      type: 'leftout',
      affected,
      cause: buildAdriftCause(input),
    })
  }

  return events
}

export function hasLeaderChanged(
  before: MatchingScenario | null,
  after: MatchingScenario | null,
): boolean {
  return leaderSignature(before) !== leaderSignature(after)
}

export function hasLeaderImproved(
  before: MatchingScenario | null,
  after: MatchingScenario | null,
): boolean {
  if (!after) return false
  if (!before) return after.score.coveredCount > 0
  if (after.score.coveredCount > before.score.coveredCount) return true
  if (after.score.coveredCount < before.score.coveredCount) return false
  if (after.score.strongInterestCount > before.score.strongInterestCount) return true
  if (after.score.strongInterestCount < before.score.strongInterestCount) return false
  if (before.score.avgRank === null) return after.score.avgRank !== null
  if (after.score.avgRank === null) return false
  return after.score.avgRank < before.score.avgRank
}

export function newlyLeftOut(
  before: Pick<MatchingScenario, 'leftOut'> | null,
  after: Pick<MatchingScenario, 'leftOut'> | null,
): ScenarioParticipant[] {
  if (!after) return []
  const beforeIds = new Set((before?.leftOut ?? []).map((participant) => participant.userId))
  return after.leftOut.filter((participant) => !beforeIds.has(participant.userId))
}

export function summarizeLeader(leader: MatchingScenario | null): FeedScenarioSummary | null {
  if (!leader) return null
  return {
    scenarioId: leader.id,
    coveredCount: leader.score.coveredCount,
    totalCount: leader.score.totalCount,
    strongInterestCount: leader.score.strongInterestCount,
    circleBookIds: leader.circles.map((circle) => circle.bookId),
    leftOutUserIds: leader.leftOut.map((participant) => participant.userId),
  }
}

export function buildAdriftCause(input: BuildFeedEventsInput): AdriftCause {
  return {
    actor: input.actor,
    bookId: input.bookId,
    mutationKind: input.kind,
    leaderBeforeId: input.leaderBefore?.id ?? null,
    leaderAfterId: input.leaderAfter?.id ?? null,
    at: input.now ?? Date.now(),
  }
}

function pickMutation(input: ActorBookMutation): FeedEventBaseDraft {
  return {
    actor: input.actor,
    bookId: input.bookId,
    mutationKind: input.kind,
  }
}

function buildBestEvent(
  mutation: FeedEventBaseDraft,
  leaderBefore: MatchingScenario | null,
  leaderAfter: MatchingScenario | null,
  improved: boolean,
): BestFeedEventDraft {
  const beforeBookIds = new Set(leaderBefore?.circles.map((circle) => circle.bookId) ?? [])
  const afterBookIds = new Set(leaderAfter?.circles.map((circle) => circle.bookId) ?? [])

  return {
    ...mutation,
    type: 'best',
    improved,
    before: summarizeLeader(leaderBefore),
    after: summarizeLeader(leaderAfter),
    addedCircleBookIds: Array.from(afterBookIds).filter((bookId) => !beforeBookIds.has(bookId)),
    removedCircleBookIds: Array.from(beforeBookIds).filter((bookId) => !afterBookIds.has(bookId)),
  }
}

function leaderSignature(leader: MatchingScenario | null): string {
  if (!leader) return ''
  const circleIds = leader.circles.map((circle) => circle.id).sort().join('|')
  const leftOutIds = leader.leftOut.map((participant) => participant.userId).sort().join('|')
  return [
    leader.id,
    leader.score.coveredCount,
    leader.score.strongInterestCount,
    leader.score.rankSum,
    circleIds,
    leftOutIds,
  ].join('::')
}

export function isMatchingMutationKind(value: string): value is MatchingMutationKind {
  return [
    'book_added',
    'book_removed',
    'rank_changed',
    'status_changed',
    'catalog_signup_updated',
    'priorities_updated',
    'participant_left',
  ].includes(value)
}

export function asMatchingScenario(value: unknown): MatchingScenario | null {
  if (!value || typeof value !== 'object') return null
  return value as MatchingScenario
}
