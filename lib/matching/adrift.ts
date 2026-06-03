import type { AdriftCause, LeftoutFeedEventDraft } from './feed-events'
import type { ScenarioSetOverview } from './scenarios'

const causesBySession = new Map<string, Map<string, AdriftCause>>()

export function rememberAdriftCause(sessionId: string, userId: string, cause: AdriftCause): void {
  let causes = causesBySession.get(sessionId)
  if (!causes) {
    causes = new Map()
    causesBySession.set(sessionId, causes)
  }
  causes.set(userId, cause)
}

export function rememberAdriftCausesFromEvents(sessionId: string, events: LeftoutFeedEventDraft[]): void {
  for (const event of events) {
    rememberAdriftCause(sessionId, event.affected.userId, event.cause)
  }
}

export function getAdriftCause(sessionId: string, userId: string): AdriftCause | null {
  return causesBySession.get(sessionId)?.get(userId) ?? null
}

export function clearAdriftCause(sessionId: string, userId: string): void {
  const causes = causesBySession.get(sessionId)
  if (!causes) return
  causes.delete(userId)
  if (causes.size === 0) causesBySession.delete(sessionId)
}

export function clearAdriftCausesForSession(sessionId: string): void {
  causesBySession.delete(sessionId)
}

export function isViewerAdrift(overview: ScenarioSetOverview, viewingUserId: string): boolean {
  const leader = overview.leader
  return !!leader && leader.leftOut.some((participant) => participant.userId === viewingUserId)
}
