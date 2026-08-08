import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { matchingSessions, matchingSessionParticipants } from '@/lib/db/schema'
import { bumpSessionState } from './version'
import { MATCHING_CURRENT_DB_STATUSES } from '../session-status'

/**
 * Сигнализирует «состояние изменилось» для активной сессии участника:
 * находит активную сессию, проверяет членство и инкрементирует её state_version.
 * Возвращает id сессии (или null, если активной сессии/членства нет).
 */
export async function broadcastActiveMatchingStateChangeForParticipant(
  userId: string,
): Promise<string | null> {
  const activeSessionId = await getActiveMatchingSessionIdForParticipant(userId)
  if (!activeSessionId) return null

  await bumpSessionState(activeSessionId)
  return activeSessionId
}

export async function getActiveMatchingSessionIdForParticipant(userId: string): Promise<string | null> {
  const [activeSession] = await db
    .select({ id: matchingSessions.id })
    .from(matchingSessions)
    .innerJoin(
      matchingSessionParticipants,
      and(
        eq(matchingSessionParticipants.sessionId, matchingSessions.id),
        eq(matchingSessionParticipants.userId, userId),
      ),
    )
    .where(inArray(matchingSessions.status, [...MATCHING_CURRENT_DB_STATUSES]))
    .orderBy(
      sql`CASE WHEN ${matchingSessions.status} IN ('active', 'open') THEN 0 ELSE 1 END`,
      desc(matchingSessions.createdAt),
    )
    .limit(1)

  if (!activeSession) return null
  return activeSession.id
}
