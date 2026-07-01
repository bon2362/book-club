import { db } from '@/lib/db'
import { emptyScenarioSetOverview, generateSatisfactionScenarioSets, type ScenarioSetOverview } from './scenarios'
import { fetchMatchingScenarioInput, fetchMatchingScenarioInputForSnapshot } from './scenario-input-db'

type DbClient = typeof db

export async function fetchMatchingScenarioOverview(
  sessionId: string,
  dbClient: DbClient = db,
  snapshot?: Parameters<typeof fetchMatchingScenarioInputForSnapshot>[0],
): Promise<ScenarioSetOverview> {
  const input = snapshot
    ? await fetchMatchingScenarioInputForSnapshot(snapshot, dbClient)
    : await fetchMatchingScenarioInput(sessionId, dbClient)
  if (!input) return emptyScenarioSetOverview([], 0, 0)
  return generateSatisfactionScenarioSets(input)
}
