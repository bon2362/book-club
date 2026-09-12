import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { matchingInstructions } from '@/lib/db/schema'
import {
  DEFAULT_MATCHING_INSTRUCTIONS,
  normalizeMatchingInstructions,
  type MatchingInstructions,
} from './instructions-content'

export { DEFAULT_MATCHING_INSTRUCTIONS, normalizeMatchingInstructions, type MatchingInstructions } from './instructions-content'

const GLOBAL_INSTRUCTIONS_ID = 'global'

export async function getMatchingInstructions(dbClient: typeof db = db): Promise<MatchingInstructions> {
  try {
    const [row] = await dbClient.select({
      title: matchingInstructions.title,
      lead: matchingInstructions.lead,
      expandLabel: matchingInstructions.expandLabel,
      collapseLabel: matchingInstructions.collapseLabel,
      bodyMarkdown: matchingInstructions.bodyMarkdown,
    }).from(matchingInstructions).where(eq(matchingInstructions.id, GLOBAL_INSTRUCTIONS_ID)).limit(1)
    return row ?? DEFAULT_MATCHING_INSTRUCTIONS
  } catch {
    // Production code can be deployed before the manually applied migration.
    return DEFAULT_MATCHING_INSTRUCTIONS
  }
}

export async function updateMatchingInstructions(value: MatchingInstructions, dbClient: typeof db = db) {
  const instructions = normalizeMatchingInstructions(value)
  await dbClient.insert(matchingInstructions).values({
    id: GLOBAL_INSTRUCTIONS_ID,
    ...instructions,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: matchingInstructions.id,
    set: { ...instructions, updatedAt: new Date() },
  })
  return instructions
}
