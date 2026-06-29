import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { matchingSessionParticipants } from '@/lib/db/schema'
import { PRESENCE_WINDOW_MS } from './presence-window'

// Значение живёт в leaf-модуле без db-зависимостей (нужно и клиентскому poll-interval.ts).
// Реэкспорт — ради обратной совместимости существующих импортов из './presence'.
export { PRESENCE_WINDOW_MS }

/** Чистый предикат «онлайн» по last_seen_at — удобно для UI/тестов. */
export function isOnline(
  lastSeenAt: Date | null | undefined,
  now: number = Date.now(),
  windowMs: number = PRESENCE_WINDOW_MS,
): boolean {
  if (!lastSeenAt) return false
  return now - lastSeenAt.getTime() <= windowMs
}

/**
 * Heartbeat присутствия (#338): отмечает userId как «виден сейчас» и возвращает
 * псевдонимы участников, онлайн в окне PRESENCE_WINDOW_MS.
 *
 * Это телеметрия — audit_capture пропускает чисто `last_seen_at`-апдейты (миграция 0042),
 * поэтому heartbeat не засоряет audit-лог. Прямой `db.update` здесь легитимен: телеметрия
 * живёт в lib/ (как `lib/user-activity.ts`), а не в route-хендлере.
 */
export async function fetchOnlinePseudonyms(
  sessionId: string,
  dbClient: typeof db = db,
): Promise<string[]> {
  const threshold = new Date(Date.now() - PRESENCE_WINDOW_MS)
  const rows = await dbClient
    .select({
      pseudonym: sql<string>`coalesce(${matchingSessionParticipants.pseudonym}, ${matchingSessionParticipants.userId})`,
    })
    .from(matchingSessionParticipants)
    .where(
      and(
        eq(matchingSessionParticipants.sessionId, sessionId),
        gte(matchingSessionParticipants.lastSeenAt, threshold),
      ),
    )
  return rows.map((r) => r.pseudonym)
}

export async function touchAndGetOnlinePseudonyms(
  sessionId: string,
  userId: string,
  dbClient: typeof db = db,
): Promise<string[]> {
  // Heartbeat звонящего. Для не-участника (админ-наблюдатель) WHERE не совпадёт — no-op.
  await dbClient
    .update(matchingSessionParticipants)
    .set({ lastSeenAt: new Date() })
    .where(
      and(
        eq(matchingSessionParticipants.sessionId, sessionId),
        eq(matchingSessionParticipants.userId, userId),
      ),
    )

  return fetchOnlinePseudonyms(sessionId, dbClient)
}
