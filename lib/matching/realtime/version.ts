import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { matchingSessions } from '@/lib/db/schema'

/**
 * Инкрементит счётчик версии сессии — единственный сигнал «состояние изменилось»,
 * который видят все serverless-инстансы. Заменяет in-memory broadcast.
 */
export async function bumpSessionState(
  sessionId: string,
  dbClient: typeof db = db,
): Promise<void> {
  await dbClient
    .update(matchingSessions)
    .set({ stateVersion: sql`${matchingSessions.stateVersion} + 1` })
    .where(eq(matchingSessions.id, sessionId))
}

export interface SessionState {
  version: number
  status: string
}

export async function getSessionState(
  sessionId: string,
  dbClient: typeof db = db,
): Promise<SessionState | null> {
  const [row] = await dbClient
    .select({ version: matchingSessions.stateVersion, status: matchingSessions.status })
    .from(matchingSessions)
    .where(eq(matchingSessions.id, sessionId))
    .limit(1)
  return row ?? null
}
