import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { matchingSessions, matchingSessionParticipants } from '@/lib/db/schema'
import { bumpSessionState } from './version'

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
    .where(eq(matchingSessions.status, 'active'))
    .limit(1)

  if (!activeSession) return null

  const [participant] = await db
    .select({ userId: matchingSessionParticipants.userId })
    .from(matchingSessionParticipants)
    .where(
      and(
        eq(matchingSessionParticipants.sessionId, activeSession.id),
        eq(matchingSessionParticipants.userId, userId),
      ),
    )
    .limit(1)

  if (!participant) return null

  return activeSession.id
}
