import { db } from '@/lib/db'
import { emptyScenarioSetOverview, generateSatisfactionScenarioSets, type ScenarioSetOverview } from './scenarios'
import { fetchMatchingScenarioInput } from './scenario-input-db'

type DbClient = typeof db

export async function fetchMatchingScenarioOverview(
  sessionId: string,
  dbClient: DbClient = db,
): Promise<ScenarioSetOverview> {
  const input = await fetchMatchingScenarioInput(sessionId, dbClient)
  if (!input) return emptyScenarioSetOverview([], 0, 0)
  return generateSatisfactionScenarioSets(input)
}
