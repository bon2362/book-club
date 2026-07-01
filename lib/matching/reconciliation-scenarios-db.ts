import { db } from '@/lib/db'
import { buildCircleKey } from './circle-key'
import type { RankedReconciliationScenario } from './confirmation-reconciliation'
import { generateSatisfactionScenarioSets, type MatchingScenario } from './scenarios'
import { fetchMatchingScenarioInput } from './scenario-input-db'

type DbClient = typeof db

export function toRankedReconciliationScenarios(
  sessionId: string,
  scenarios: MatchingScenario[],
): RankedReconciliationScenario[] {
  return scenarios.map((scenario) => ({
    circles: scenario.circles.map((circle) => {
      const memberUserIds = circle.members.map(({ userId }) => userId).sort()
      return {
        circleKey: buildCircleKey({ sessionId, bookId: circle.bookId, memberUserIds }),
        bookId: circle.bookId,
        memberUserIds,
      }
    }),
  }))
}

export async function fetchRankedMatchingScenarios(
  sessionId: string,
  dbClient: DbClient = db,
): Promise<RankedReconciliationScenario[]> {
  const input = await fetchMatchingScenarioInput(sessionId, dbClient)
  if (!input) return []
  return toRankedReconciliationScenarios(sessionId, generateSatisfactionScenarioSets(input).scenarios)
}
